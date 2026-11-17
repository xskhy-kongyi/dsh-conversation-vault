/**
 * Host half of the session vault.
 *
 * Three jobs:
 *  - the session inventory the page filters into hidden/archived rows;
 *  - hide / restore / delete, where delete never touches a file;
 *  - memory cards: a distilled conversation written as one editable Markdown
 *    document, readable from any later session through the `memory_card` tool.
 *
 * Cards are the only state this plugin owns, and they live beside the package.
 */
import { rm, stat, mkdir, readFile, writeFile, readdir, unlink, rename } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const API = '/dsh-conversation-vault/api'

/**
 * Cards are user data, so they live in the Harness home rather than inside the
 * package: a published bundle lives under node_modules and is replaced on every
 * upgrade. The package-local directory is only read once, to migrate cards that
 * were written before this move.
 */
const PACKAGE_CARD_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'cards')
const HARNESS_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DATA_DIR = join(HARNESS_HOME, 'storages', 'session-vault')
const CARD_DIR = join(DATA_DIR, 'cards')

export const inject = ['webServer', 'workspaceRegistry', 'sessionPersistence', 'tools']

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

function pathKey(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

const messageOf = (error) => String((error && error.message) || error || 'unknown error')

function clamp(text, max) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return value.length > max ? value.slice(0, max - 1) + '…' : value
}

/* ------------------------------------------------------------ card files */

function cardId(title) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const slug = String(title || 'card')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${stamp}-${slug || 'card'}`
}

/** One Markdown document: a small YAML-ish head, then the body the user edits. */
function serializeCard(card) {
  const head = [
    '---',
    `id: ${JSON.stringify(card.id)}`,
    `title: ${JSON.stringify(card.title || '')}`,
    `workspace: ${JSON.stringify(card.workspace || '')}`,
    `source: ${JSON.stringify(card.source || '')}`,
    `created: ${card.created || new Date().toISOString()}`,
    `updated: ${card.updated || new Date().toISOString()}`,
    `tags: ${JSON.stringify(card.tags || [])}`,
    '---',
    '',
    String(card.body || '').replace(/\s+$/, ''),
    '',
  ]
  return head.join('\n')
}

function parseCard(text, fallbackId) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  const card = { id: fallbackId, title: '', workspace: '', source: '', tags: [], body: '', created: '', updated: '' }
  if (!match) {
    card.body = text
    return card
  }
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    const raw = line.slice(at + 1).trim()
    let value = raw
    try {
      value = JSON.parse(raw)
    } catch {
      // Plain YAML scalars (dates) stay strings.
    }
    if (key === 'tags' && Array.isArray(value)) card.tags = value.map(String)
    else if (key in card) card[key] = value
  }
  card.body = text.slice(match[0].length)
  return card
}

async function loadCards() {
  let names = []
  try {
    names = await readdir(CARD_DIR)
  } catch {
    return []
  }
  const cards = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    try {
      const text = await readFile(join(CARD_DIR, name), 'utf8')
      cards.push(parseCard(text, basename(name, '.md')))
    } catch {
      // A half-written card must not break the list.
    }
  }
  cards.sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)))
  return cards
}

const BACKUP_DIR = join(CARD_DIR, '.backup')
const TRASH_DIR = join(CARD_DIR, '.trash')
const BACKUPS_PER_CARD = 5
const TRASH_LIMIT = 40

function stamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
}

/** Keep the previous version before an overwrite, pruned to the newest few. */
async function backupCard(id, text) {
  try {
    await mkdir(BACKUP_DIR, { recursive: true })
    await writeFile(join(BACKUP_DIR, `${id}-${stamp()}.md`), text, 'utf8')
    const names = (await readdir(BACKUP_DIR))
      .filter((name) => name.startsWith(`${id}-`) && name.endsWith('.md'))
      .sort()
    for (const name of names.slice(0, Math.max(0, names.length - BACKUPS_PER_CARD))) {
      await unlink(join(BACKUP_DIR, name)).catch(() => {})
    }
  } catch {
    // A failed backup must never block the save.
  }
}

async function writeCard(card) {
  await mkdir(CARD_DIR, { recursive: true })
  const target = join(CARD_DIR, `${card.id}.md`)
  try {
    await backupCard(card.id, await readFile(target, 'utf8'))
  } catch {
    // First write: there is no previous version.
  }
  await writeFile(target, serializeCard(card), 'utf8')
  return card
}

async function pruneTrash() {
  try {
    const names = (await readdir(TRASH_DIR)).filter((name) => name.endsWith('.md')).sort()
    for (const name of names.slice(0, Math.max(0, names.length - TRASH_LIMIT))) {
      await unlink(join(TRASH_DIR, name)).catch(() => {})
    }
  } catch {
    // Trimming is best effort.
  }
}

/** Deleting a card moves it to the trash instead of unlinking it. */
async function deleteCard(id) {
  try {
    await mkdir(TRASH_DIR, { recursive: true })
    await rename(join(CARD_DIR, `${id}.md`), join(TRASH_DIR, `${id}-${stamp()}.md`))
    await pruneTrash()
    return true
  } catch {
    return false
  }
}

const trashId = (file) => String(file).replace(/-\d{14}\.md$/, '')

async function loadTrash() {
  let names = []
  try {
    names = await readdir(TRASH_DIR)
  } catch {
    return []
  }
  const items = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    try {
      const card = parseCard(await readFile(join(TRASH_DIR, name), 'utf8'), trashId(name))
      items.push({
        file: name,
        id: card.id,
        title: card.title,
        workspace: card.workspace,
        updated: card.updated,
        excerpt: clamp(card.body, 120),
      })
    } catch {
      // A broken trash entry must not break the list.
    }
  }
  items.sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
  return items
}

async function restoreTrash(file) {
  const safe = basename(String(file || ''))
  if (!safe.endsWith('.md')) return false
  try {
    const card = parseCard(await readFile(join(TRASH_DIR, safe), 'utf8'), trashId(safe))
    await writeCard({ ...card, updated: new Date().toISOString() })
    await unlink(join(TRASH_DIR, safe))
    return true
  } catch {
    return false
  }
}

function publicCard(card) {
  return {
    id: card.id,
    title: card.title,
    workspace: card.workspace,
    source: card.source,
    created: card.created,
    updated: card.updated,
    tags: card.tags,
    body: card.body,
    excerpt: clamp(card.body, 180),
  }
}

/* ------------------------------------------------------------- distilling */

function textOfMessage(message) {
  const blocks = message && Array.isArray(message.content) ? message.content : []
  return blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/** Runtime-injected context arrives as user messages; it is not a question. */
const INJECTED_PREFIXES = [
  '<system-reminder>',
  '<hindsight_knowledge',
  '<environment',
  'Current runtime context',
  'Runtime context',
  'Time sampled',
  'Saved attachments',
  '[Image',
]

function isInjected(text) {
  const head = String(text || '').slice(0, 40)
  return INJECTED_PREFIXES.some((prefix) => head.startsWith(prefix))
}

const PATH_PATTERN = /"file_path"\s*:\s*"((?:[^"\\]|\\.)*)"/g
const FILE_TOOLS = new Set(['write', 'edit', 'apply_patch', 'notebook_edit', 'multi_edit'])

function collectPaths(argumentText, into) {
  for (const match of String(argumentText || '').matchAll(PATH_PATTERN)) {
    const value = match[1].replace(/\\(.)/g, '$1')
    if (!value) continue
    if (!/^[a-zA-Z]:[\\/]/.test(value) && !value.startsWith('/')) continue
    into.add(value)
  }
}

/** Compose the first draft of a card body; the user edits it afterwards. */
function composeBody(fold) {
  const lines = ['## 目标', '', fold.goal || '（未记录）', '']
  if (fold.asks.length > 1) {
    lines.push('## 关键提问', '')
    for (const ask of fold.asks.slice(0, 5)) lines.push(`- ${clamp(ask, 160)}`)
    lines.push('')
  }
  lines.push('## 结论', '')
  if (fold.outcomes.length === 0) lines.push('（未记录）')
  for (const outcome of fold.outcomes.slice(-3)) lines.push(`- ${clamp(outcome, 300)}`)
  lines.push('')
  if (fold.files.length > 0) {
    lines.push('## 涉及文件', '')
    for (const file of fold.files) lines.push(`- \`${file}\``)
    lines.push('')
  }
  if (fold.tools.length > 0) {
    lines.push('## 用到的工具', '')
    lines.push(fold.tools.map((tool) => `${tool.name} ×${tool.count}`).join(' · '))
    lines.push('')
  }
  lines.push('## 经验', '', '（待补充：这次踩过的坑、下次可以复用的做法。）', '')
  return lines.join('\n')
}

/** Copy cards written by older builds into the Harness home, once. */
async function migrateLegacyCards() {
  let names = []
  try {
    names = await readdir(PACKAGE_CARD_DIR)
  } catch {
    return
  }
  try {
    await mkdir(CARD_DIR, { recursive: true })
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const target = join(CARD_DIR, name)
    try {
      await stat(target)
      continue
    } catch {
      // not migrated yet
    }
    try {
      await writeFile(target, await readFile(join(PACKAGE_CARD_DIR, name)), 'utf8')
    } catch {
      // A failed migration must not block the plugin.
    }
  }
}

export function apply(ctx) {
  void migrateLegacyCards()

  /** Fold titles for the given sessions through the optional query service. */
  async function titlesOf(ids) {
    const map = new Map()
    if (ids.length === 0) return map
    const query = ctx.get('sessionQuery')
    if (!query) return map
    try {
      const results = await query.readTitleSnapshots(ids)
      for (const entry of results ?? []) {
        const title = entry && entry.status === 'fulfilled' && entry.value && entry.value.title
        if (title && title.title) map.set(String(entry.sessionId), title.title)
      }
    } catch {
      // Titles are cosmetic: an unreadable log still lists by id and time.
    }
    return map
  }

  /**
   * Every stored session with the workspace it maps to. The caller decides what
   * is hidden (not attached) and what is archived (its own archive set, which
   * the Host cannot see), so this stays a plain description of what exists.
   */
  async function inventory() {
    const workspaces = ctx.workspaceRegistry.list()
    const attached = new Set()
    const byPath = new Map()
    for (const workspace of workspaces) {
      for (const id of workspace.sessionIds ?? []) attached.add(String(id))
      byPath.set(pathKey(workspace.path), workspace)
    }
    const snapshots = await ctx.sessionPersistence.list()
    const visible = snapshots.filter((snapshot) => snapshot.header.origin !== 'subagent')
    const titles = await titlesOf(visible.map((snapshot) => snapshot.header.id))
    const items = visible.map((snapshot) => {
      const id = String(snapshot.header.id)
      const cwd = snapshot.header.cwd ?? ''
      const home = cwd ? byPath.get(pathKey(cwd)) : undefined
      return {
        id,
        title: titles.get(id) ?? '',
        cwd,
        createdAt: snapshot.header.createdAt ?? 0,
        sizeBytes: typeof snapshot.sizeBytes === 'number' ? snapshot.sizeBytes : null,
        attached: attached.has(id),
        workspaceId: home ? String(home.id) : '',
        workspaceTitle: home ? home.title : '',
      }
    })
    items.sort((a, b) => b.createdAt - a.createdAt)
    return { ok: true, items }
  }

  /** Detach one session from every workspace that claims it. */
  async function detachEverywhere(sessionId) {
    const target = String(sessionId)
    let moved = 0
    for (const workspace of ctx.workspaceRegistry.list()) {
      if ((workspace.sessionIds ?? []).some((id) => String(id) === target)) {
        await workspace.detachSession(sessionId)
        moved += 1
      }
    }
    return moved
  }

  /** Read one stored conversation into the raw material a card is drafted from. */
  async function foldSession(sessionId) {
    const query = ctx.get('sessionQuery')
    if (!query) throw Object.assign(new Error('session query service is unavailable'), { code: 'no-query' })
    const snapshot = await query.readSession(sessionId)
    const events = snapshot.events || []
    const users = []
    const assistants = []
    const files = new Set()
    const tools = new Map()
    let turns = 0
    for (const event of events) {
      if (event.type === 'turn/start') {
        turns += 1
      } else if (event.type === 'user/message') {
        // A user event's `data` is the message itself, not `{ message }`.
        const text = textOfMessage(event.data)
        if (text && !isInjected(text)) users.push(text)
      } else if (event.type === 'assistant/message') {
        const text = textOfMessage(event.data.message)
        if (text) assistants.push(text)
      } else if (event.type === 'tool/call') {
        const name = String(event.data.name || '')
        if (name) tools.set(name, (tools.get(name) || 0) + 1)
        if (FILE_TOOLS.has(name)) collectPaths(event.data.arguments, files)
      }
    }
    let title = ''
    try {
      const snapshotTitle = await query.readTitle(sessionId)
      title = (snapshotTitle && snapshotTitle.title) || ''
    } catch {
      // A missing title is cosmetic; the card still carries the conversation.
    }
    return {
      sessionId: String(sessionId),
      title: clamp(title, 80),
      workspace: snapshot.session.cwd || '',
      createdAt: snapshot.session.createdAt || 0,
      turns,
      messages: users.length,
      goal: clamp(users[0] || '', 400),
      asks: users.slice(0, 8).map((text) => clamp(text, 200)),
      outcomes: assistants.slice(-6).map((text) => clamp(text, 600)),
      files: [...files].slice(0, 12),
      tools: [...tools.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, count]) => ({ name, count })),
    }
  }

  async function draftCard(sessionId) {
    const fold = await foldSession(sessionId)
    const now = new Date().toISOString()
    const card = await writeCard({
      id: cardId(fold.title || `session-${fold.sessionId.slice(-6)}`),
      title: fold.title || '未命名会话',
      workspace: fold.workspace,
      source: fold.sessionId,
      created: now,
      updated: now,
      tags: [],
      body: composeBody(fold),
    })
    return publicCard(card)
  }

  /** Resolve a card by exact id, then by title/id substring; latest wins. */
  async function resolveCard(reference) {
    const cards = await loadCards()
    const needle = String(reference || '').trim().toLowerCase()
    if (!needle) return undefined
    return (
      cards.find((card) => card.id.toLowerCase() === needle) ||
      cards.find((card) => card.title.toLowerCase() === needle) ||
      cards.find((card) => card.title.toLowerCase().includes(needle)) ||
      cards.find((card) => card.id.toLowerCase().includes(needle))
    )
  }

  /** Resolve a stored conversation by id, exact title, or a fragment of either. */
  async function findSession(reference) {
    const { items } = await inventory()
    const needle = String(reference || '').trim().toLowerCase()
    if (!needle) return undefined
    return (
      items.find((item) => item.id.toLowerCase() === needle) ||
      items.find((item) => item.title.toLowerCase() === needle) ||
      items.find((item) => item.title.toLowerCase().includes(needle)) ||
      items.find((item) => item.id.toLowerCase().includes(needle))
    )
  }

  /** The material a model works from when it writes a card by hand. */
  function renderFold(fold) {
    return [
      `conversation: ${fold.title || '(untitled)'}`,
      `id: ${fold.sessionId}`,
      `workspace: ${fold.workspace || '(none)'}`,
      `turns: ${fold.turns}, asks: ${fold.messages}, started: ${new Date(fold.createdAt || Date.now()).toISOString()}`,
      '',
      '## goal',
      fold.goal || '(none)',
      '',
      '## asks',
      ...(fold.asks.length > 0 ? fold.asks.map((text) => '- ' + text) : ['(none)']),
      '',
      '## outcomes',
      ...(fold.outcomes.length > 0 ? fold.outcomes.map((text) => '- ' + text) : ['(none)']),
      '',
      '## files',
      ...(fold.files.length > 0 ? fold.files.map((file) => '- ' + file) : ['(none)']),
      '',
      '## tools',
      fold.tools.map((tool) => `${tool.name} ×${tool.count}`).join(' · ') || '(none)',
    ].join('\n')
  }

  function route(path, handler) {    ctx.effect(() => {
      const dispose = ctx.webServer.register({ kind: 'exact', path, handler })
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    })
  }

  /* ----------------------------------------------------------------- tools */

  ctx.effect(() => {
    // A rejected definition must not take the whole plugin down with it.
    try {
      return ctx.tools.register({
      name: 'memory_card',
      description:
        'Memory cards: the user\'s distilled notes about past conversations, kept after those conversations are deleted. ' +
        'Workflow for "distill this conversation for me": call action="sessions" (or with a reference) to find it, ' +
        'action="fold" to read the raw material, then write a proper card yourself and persist it with action="save". ' +
        'Use action="list"/"read" to recall earlier cards. Always prefer the user\'s own words for the card title.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'read', 'save', 'append', 'sessions', 'fold'],
            description:
              'list/read = existing cards; save = create or overwrite a card; append = add Markdown to an existing card (use it to build a long card in several calls); sessions = find conversations; fold = read one conversation as raw material.',
          },
          reference: {
            type: 'string',
            description:
              'Card id or title (read/save), or a conversation id, title fragment or keyword (sessions/fold).',
          },
          title: { type: 'string', description: 'Card title (save).' },
          id: { type: 'string', description: 'Card id to update in place (save). Use it after a card was renamed, so the old title cannot create a duplicate.' },
          body: { type: 'string', description: 'Full Markdown body (save).' },
          source: { type: 'string', description: 'Conversation id this card was distilled from (save).' },
          workspace: { type: 'string', description: 'Workspace path the conversation belonged to (save).' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
      },
      execute: async (args) => {
        const action = String(args && args.action ? args.action : 'list')
        if (action === 'list') {
          const cards = await loadCards()
          if (cards.length === 0) return { text: 'No memory cards yet.' }
          const lines = cards.map((card) => `- ${card.title || '(untitled)'}  [${card.id}]  ${card.workspace}\n  ${clamp(card.body, 120)}`)
          return { text: `Memory cards (${cards.length}):\n${lines.join('\n')}` }
        }
        if (action === 'read') {
          const card = await resolveCard(args && args.reference)
          if (!card) return { text: `No card matches ${JSON.stringify(String((args && args.reference) || ''))}.` }
          return { text: `# ${card.title}\n(id: ${card.id}, workspace: ${card.workspace})\n\n${card.body}` }
        }
        if (action === 'sessions') {
          const { items } = await inventory()
          const needle = String((args && args.reference) || '').trim().toLowerCase()
          const matched = needle
            ? items.filter(
                (item) =>
                  item.title.toLowerCase().includes(needle) ||
                  item.id.toLowerCase().includes(needle) ||
                  item.cwd.toLowerCase().includes(needle),
              )
            : items
          if (matched.length === 0) return { text: 'No stored conversation matches that reference.' }
          const lines = matched.slice(0, 25).map(
            (item) =>
              `- ${item.title || '(untitled)'}  [${item.id}]  ${item.workspaceTitle || item.cwd || '(no workspace)'}  ${new Date(item.createdAt || 0).toISOString().slice(0, 10)}`,
          )
          return {
            text: `Conversations (${matched.length}${matched.length > 25 ? ', first 25' : ''}):\n${lines.join('\n')}`,
          }
        }
        if (action === 'fold') {
          const session = await findSession(args && args.reference)
          if (!session) {
            return {
              text: `No conversation matches ${JSON.stringify(String((args && args.reference) || ''))}. Try action="sessions" first.`,
            }
          }
          return { text: renderFold(await foldSession(session.id)) }
        }
        if (action === 'save') {
          const title = String((args && args.title) || (args && args.reference) || '').trim()
          const body = String((args && args.body) || '')
          if (!title || !body) return { text: 'save needs both a title and a body.' }
          // An explicit id wins: a card renamed in the vault must not fork into a
          // second card just because the caller still remembers the old title.
          const explicitId = String((args && args.id) || '').trim()
          const existing = explicitId ? await resolveCard(explicitId) : await resolveCard(title)
          const now = new Date().toISOString()
          const card = {
            id: existing ? existing.id : cardId(title),
            title,
            workspace: existing ? existing.workspace : String((args && args.workspace) || ''),
            source: existing ? existing.source : String((args && args.source) || ''),
            created: existing ? existing.created : now,
            updated: now,
            tags: existing ? existing.tags : [],
            body,
          }
          await writeCard(card)
          return { text: `Saved card "${title}" (${card.id}), ${body.length} characters.` }
        }
        if (action === 'append') {
          const card = await resolveCard((args && (args.reference || args.title)) || '')
          if (!card) return { text: 'append needs an existing card: pass reference (id or title).' }
          const extra = String((args && args.body) || '')
          if (!extra) return { text: 'append needs a body.' }
          const body = `${card.body.replace(/\s+$/, '')}\n\n${extra}`
          await writeCard({ ...card, body, updated: new Date().toISOString() })
          return { text: `Appended ${extra.length} characters to "${card.title}" (${card.id}), now ${body.length} characters.` }
        }
        return { text: `Unknown action ${action}.` }
      },
      })
    } catch {
      return () => {}
    }
  })

  /* ---------------------------------------------------------------- routes */

  route(`${API}/list`, async (request, response) => {
    if (request.method !== 'GET') return sendJson(response, 405, { ok: false, error: 'GET only' })
    try {
      sendJson(response, 200, await inventory())
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/digest`, async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'POST only' })
    const { sessionId } = await readJson(request)
    if (!sessionId) return sendJson(response, 400, { ok: false, code: 'missing-session', error: 'missing sessionId' })
    try {
      sendJson(response, 200, { ok: true, card: await draftCard(sessionId) })
    } catch (error) {
      if (error && error.code === 'no-query') {
        return sendJson(response, 409, {
          ok: false,
          code: 'no-query',
          error: 'the session query service is unavailable',
        })
      }
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/digests`, async (request, response) => {
    if (request.method !== 'GET') return sendJson(response, 405, { ok: false, error: 'GET only' })
    try {
      const cards = await loadCards()
      sendJson(response, 200, { ok: true, items: cards.map(publicCard) })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/digests/save`, async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'POST only' })
    const body = await readJson(request)
    const id = String(body.id || '')
    try {
      const existing = id ? await resolveCard(id) : undefined
      if (!existing) return sendJson(response, 404, { ok: false, error: 'card not found' })
      const card = {
        ...existing,
        title: body.title === undefined ? existing.title : String(body.title),
        body: body.body === undefined ? existing.body : String(body.body),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : existing.tags,
        updated: new Date().toISOString(),
      }
      await writeCard(card)
      sendJson(response, 200, { ok: true, card: publicCard(card) })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/digests/delete`, async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'POST only' })
    const { id } = await readJson(request)
    if (!id) return sendJson(response, 400, { ok: false, error: 'missing id' })
    try {
      sendJson(response, 200, { ok: true, deleted: await deleteCard(String(id)) })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/digests/trash`, async (request, response) => {
    try {
      sendJson(response, 200, { ok: true, items: await loadTrash() })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/digests/trash/restore`, async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'POST only' })
    const { file } = await readJson(request)
    if (!file) return sendJson(response, 400, { ok: false, error: 'missing file' })
    try {
      sendJson(response, 200, { ok: true, restored: await restoreTrash(String(file)) })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/hide`, async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'POST only' })
    const { sessionId } = await readJson(request)
    if (!sessionId) return sendJson(response, 400, { ok: false, code: 'missing-session', error: 'missing sessionId' })
    try {
      // `agents.get` only proves the session is live in memory (it is open in the
      // UI); the shipped archive admission counts an Agent as busy by `status`.
      const agents = ctx.get('agents')
      const agent = agents ? agents.get(sessionId) : undefined
      if (agent && agent.status === 'running') {
        return sendJson(response, 409, {
          ok: false,
          code: 'running',
          error: 'this session is running a turn',
        })
      }
      const moved = await detachEverywhere(sessionId)
      if (moved === 0) {
        return sendJson(response, 409, {
          ok: false,
          code: 'not-attached',
          error: 'not attached to a workspace',
        })
      }
      sendJson(response, 200, { ok: true })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/restore`, async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'POST only' })
    const { sessionId, workspaceId } = await readJson(request)
    if (!sessionId) return sendJson(response, 400, { ok: false, error: 'missing sessionId' })
    try {
      const snapshot = await ctx.sessionPersistence.stat(sessionId)
      if (!snapshot) {
        return sendJson(response, 404, { ok: false, code: 'missing-session', error: 'session no longer exists' })
      }
      const workspaces = ctx.workspaceRegistry.list()
      let workspace = workspaceId
        ? workspaces.find((candidate) => String(candidate.id) === String(workspaceId))
        : undefined
      if (!workspace) {
        const cwd = pathKey(snapshot.header.cwd)
        workspace = cwd ? workspaces.find((candidate) => pathKey(candidate.path) === cwd) : undefined
      }
      if (!workspace) {
        return sendJson(response, 409, { ok: false, error: 'no workspace matches that directory' })
      }
      await workspace.attachSession(sessionId)
      sendJson(response, 200, { ok: true, workspaceId: String(workspace.id) })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })

  route(`${API}/delete`, async (request, response) => {
    if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'POST only' })
    const { sessionId } = await readJson(request)
    if (!sessionId) return sendJson(response, 400, { ok: false, error: 'missing sessionId' })
    try {
      // A live-but-idle Agent does not block deletion: the UI keeps recently
      // opened sessions in memory for a long time, so "close it first" was an
      // instruction nobody could follow. Only a running turn is refused, and the
      // response tells the caller to refresh when the log had a live owner.
      const agents = ctx.get('agents')
      const agent = agents ? agents.get(sessionId) : undefined
      if (agent && agent.status === 'running') {
        return sendJson(response, 409, {
          ok: false,
          code: 'running',
          error: 'this session is running a turn',
        })
      }
      const hadLiveOwner = agent !== undefined
      const snapshot = await ctx.sessionPersistence.stat(sessionId)
      if (!snapshot) {
        return sendJson(response, 404, { ok: false, code: 'missing-session', error: 'session no longer exists' })
      }
      // Deleting a parent would leave its forks pointing at nothing, so make the
      // caller remove the children first instead of silently orphaning them.
      const children = (await ctx.sessionPersistence.list()).filter(
        (candidate) => String(candidate.header.parentSession ?? '') === String(sessionId),
      ).length
      if (children > 0) {
        return sendJson(response, 409, {
          ok: false,
          code: 'has-children',
          children,
          error: 'this session has forked children',
        })
      }
      // Validate everything BEFORE detaching: a failure after the detach used to
      // leave the session in no workspace, which the sidebar renders as an
      // orphaned "Ungrouped" row.
      const location = snapshot.location
      const target = location && location.path
      if (!target) return sendJson(response, 409, { ok: false, error: 'no storage location for this session' })
      // Refuse anything that is not obviously this session's own directory.
      if (!pathKey(target).includes(String(sessionId).toLowerCase())) {
        return sendJson(response, 409, { ok: false, error: 'storage path failed validation' })
      }
      const holders = ctx.workspaceRegistry
        .list()
        .filter((workspace) => (workspace.sessionIds ?? []).some((id) => String(id) === String(sessionId)))
      for (const workspace of holders) await workspace.detachSession(sessionId)
      try {
        const info = await stat(target)
        await rm(target, { recursive: info.isDirectory(), force: true, maxRetries: 2 })
      } catch (error) {
        // Put it back where it came from so nothing is left half-deleted.
        for (const workspace of holders) {
          await workspace.attachSession(sessionId).catch(() => {})
        }
        return sendJson(response, 500, { ok: false, code: 'delete-failed', error: messageOf(error) })
      }
      sendJson(response, 200, { ok: true, hadLiveOwner })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: messageOf(error) })
    }
  })
}
