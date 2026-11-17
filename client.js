/**
 * Client half of the session vault.
 *
 * Actions ride the shell's own context menu (`ctx.contextMenus`): a data
 * contribution needs no renderer, inherits the shipped popup's placement,
 * focus, keyboard and dismissal behaviour, and cannot outlive the row it
 * belongs to. The page is the only custom surface.
 */
window.__ModuleLoader__.load({
  id: 'dsh-conversation-vault',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const PANEL_ID = 'session-vault'
    const API = '/dsh-conversation-vault/api'

    /** Shown at the bottom of the page so users can find the author. */
    const AUTHOR = {
      name: '相思空何意',
      site: 'Bilibili',
      url: 'https://space.bilibili.com/1317598808',
    }

    /** Client services captured at apply time. */
    let services = null

    /* ------------------------------------------------------------- wording */

    const DICT = {
      zh: {
        title: '会话仓库',
        count: '{n} 个对话',
        loading: '读取中…',
        failed: '读取失败：{error}',
        failure: '操作失败：{error}',
        dismiss: '知道了',
        authorLabel: '作者',
        errRunning: '这个对话正在跑一个回合（或在等你回答），先停掉它再操作。',
        deletedSidebarHint: '已删除。侧栏如果还残留一条「未分组」的旧记录，点右边按钮刷新即可消失。',
        reload: '刷新页面',
        reloadPage: '重新加载页面',
        trashSection: '刚删掉的记忆卡（可恢复）',
        trashRestored: '已恢复「{title}」',
        errChildren: '这个对话还有 {n} 个分叉出来的子对话，请先删除它们。',
        errMissing: '这个对话已经不存在了。',
        errNotAttached: '这个对话不属于任何工作区，不需要收起。',
        staleHost:
          'Host 端还是旧版本（这次的改动包含 Host 代码）。请完全退出并重新打开 DeepSeek Harness，再回到这一页。',
        retry: '重试',
        refresh: '刷新',
        hiddenSection: '隐藏区',
        archivedSection: '归档区',
        hiddenEmpty: '还没有隐藏的对话。点对话行尾的「…」，菜单里有「彻底收起」。',
        archivedEmpty: '还没有归档的对话。',
        intro:
          '隐藏区是本插件收起的对话（不属于任何工作区）；归档区是官方归档过的对话，按原工作区分组。删除只清掉对话记录本身，不动任何文件。',
        archiveNote:
          '侧栏是否显示归档对话，由侧栏对话列表右上角的「视图选项」（滑杆图标）→ 筛选控制：选「隐藏已归档」它就彻底不显示；选「全部对话（显示已归档）」它会回来但点不开。',
        groupNote:
          '归档记录里没有「谁归档的」这个字段，所以这里按原工作区分组：来自其它插件的对话通常自成一组，可以整组清掉。',
        untitled: '未命名对话',
        kindArchived: '已归档',
        kindHidden: '已隐藏',
        restore: '恢复',
        remove: '删除',
        rowRename: '重命名',
        rowSave: '保存',
        clearGroup: '清空这一组',
        groupFallback: '未命名',
        groupGone: '原工作区已删除',
        currentWorkspace: '{workspace}',
        dialogDeleteTitle: '删除对话',
        dialogDeleteBody: '彻底删除对话「{name}」？只删除对话记录，不删除任何文件。',
        dialogClearTitle: '清空这一组',
        dialogClearBody: '删除「{group}」里的 {n} 个对话？只删除对话记录，不删除任何文件。',
        confirm: '确认',
        cancel: '取消',
        pickerHint: '这个对话原来的工作区已经找不到了。选一个工作区把它恢复过去：',
        pickerApply: '恢复到这里',
        menuHide: '彻底收起（只在会话仓库可见）',
        menuDigest: '蒸馏成记忆卡',
        menuDelete: '删除对话（保留文件）',
        digestDone: '已生成记忆卡「{name}」',
        digestFailed: '蒸馏失败',
        cardSection: '记忆卡',
        cardEmpty: '还没有记忆卡。右键任意对话 →「蒸馏成记忆卡」。',
        cardExpand: '展开',
        cardCollapse: '收起',
        cardEdit: '编辑',
        cardSave: '保存',
        cardEmptyBody: '（这张卡片还是空的）',
        cardDelete: '删除卡片',
        menuDeleteConfirmItem: '确认删除「{name}」',
        hideDone: '已收起「{name}」',
        deleteDone: '已删除「{name}」',
        undo: '撤销',
        undoFailed: '撤销失败',
        menuHideFailed: '收起失败',
        menuDeleteFailed: '删除失败',
      },
      en: {
        title: 'Session vault',
        count: '{n} conversations',
        loading: 'Loading…',
        failed: 'Could not load: {error}',
        failure: 'Failed: {error}',
        dismiss: 'Dismiss',
        authorLabel: 'By',
        errRunning: 'This conversation is running a turn (or waiting for your answer); stop it first.',
        deletedSidebarHint: 'Deleted. If the sidebar still shows it under Ungrouped, use the button on the right to refresh.',
        reload: 'Refresh page',
        reloadPage: 'Reload page',
        trashSection: 'Recently deleted cards (restorable)',
        trashRestored: 'Restored “{title}”',
        errChildren: 'This conversation has {n} forked child conversation(s); delete those first.',
        errMissing: 'That conversation no longer exists.',
        errNotAttached: 'That conversation belongs to no workspace, so there is nothing to tuck away.',
        staleHost:
          'The Host half is still the previous version. Quit and reopen DeepSeek Harness, then come back to this page.',
        retry: 'Retry',
        refresh: 'Refresh',
        hiddenSection: 'Hidden',
        archivedSection: 'Archived',
        hiddenEmpty: 'Nothing hidden yet. Open the “…” menu on a conversation and choose “Tuck away”.',
        archivedEmpty: 'Nothing archived yet.',
        intro:
          'Hidden holds conversations this plugin took out of every workspace. Archived holds the ones the shipped archive set aside, grouped by their workspace. Deleting removes only the conversation log, never a file.',
        archiveNote:
          'Whether archived conversations appear in the sidebar is controlled by the sidebar view options (sliders icon) → filter: “Hide archived” removes them entirely; “All conversations” shows them greyed out and unopenable.',
        groupNote:
          'The archive records no author, so rows are grouped by their original workspace: conversations produced by another plugin usually form one group and can be cleared together.',
        untitled: 'Untitled conversation',
        kindArchived: 'archived',
        kindHidden: 'hidden',
        restore: 'Restore',
        remove: 'Delete',
        rowRename: 'Rename',
        rowSave: 'Save',
        clearGroup: 'Clear group',
        groupFallback: 'Untitled',
        groupGone: 'Workspace removed',
        currentWorkspace: '{workspace}',
        dialogDeleteTitle: 'Delete conversation',
        dialogDeleteBody: 'Permanently delete “{name}”? Only the conversation log is removed; no file is touched.',
        dialogClearTitle: 'Clear this group',
        dialogClearBody: 'Delete {n} conversations in “{group}”? Only conversation logs are removed; no file is touched.',
        confirm: 'Delete',
        cancel: 'Cancel',
        pickerHint: 'The workspace this conversation belonged to is gone. Pick a workspace to restore it into:',
        pickerApply: 'Restore here',
        menuHide: 'Tuck away (only visible in Session vault)',
        menuDigest: 'Distill into a memory card',
        menuDelete: 'Delete conversation (keep files)',
        digestDone: 'Memory card created for “{name}”',
        digestFailed: 'Could not distill',
        cardSection: 'Memory cards',
        cardEmpty: 'No memory cards yet. Right-click any conversation → “Distill into a memory card”.',
        cardExpand: 'Expand',
        cardCollapse: 'Collapse',
        cardEdit: 'Edit',
        cardSave: 'Save',
        cardEmptyBody: '(this card is still empty)',
        cardDelete: 'Delete card',
        menuDeleteConfirmItem: 'Confirm deleting “{name}”',
        hideDone: 'Tucked away “{name}”',
        deleteDone: 'Deleted “{name}”',
        undo: 'Undo',
        undoFailed: 'Could not undo',
        menuHideFailed: 'Could not tuck away',
        menuDeleteFailed: 'Could not delete',
      },
    }

    let resolvedLang = null

    /** The running UI's locale when it is reachable, the OS locale otherwise. */
    function currentLang() {
      if (resolvedLang) return resolvedLang
      let id = ''
      try {
        const snapshot = services && services.locale && services.locale.getLocale()
        id = (snapshot && (snapshot.id || snapshot.locale)) || ''
      } catch {}
      if (!id && typeof navigator !== 'undefined') id = navigator.language || ''
      resolvedLang = /^zh/i.test(id) ? 'zh' : 'en'
      return resolvedLang
    }

    function t(key, vars) {
      const dict = DICT[currentLang()]
      const raw = (dict && dict[key]) || DICT.en[key] || key
      if (!vars) return raw
      return raw.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
      )
    }

    /* ---------------------------------------------------------------- util */

    function api(path) {
      const relative = String(path).replace(/^\/+/, '')
      if (typeof document === 'undefined') return '/' + relative
      return new URL(relative, document.baseURI).pathname
    }

    async function call(path, init) {
      const response = await fetch(api(path), { cache: 'no-store', ...init })
      let body = {}
      try {
        body = await response.json()
      } catch {
        body = {}
      }
      if (!response.ok || body.ok === false) {
        const problem = new Error(body.error || 'HTTP ' + response.status)
        problem.code = body.code
        problem.children = body.children
        throw problem
      }
      return body
    }

    const post = (path, payload) =>
      call(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

    const hide = (sessionId) => post(API + '/hide', { sessionId })
    const unarchive = (sessionId) => services.workspaces.unarchiveSession(sessionId)
    const pathKey = (value) =>
      String(value == null ? '' : value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const timeLabel = (value) => (value ? new Date(value).toLocaleString() : '')

    function sizeLabel(bytes) {
      if (typeof bytes !== 'number' || bytes <= 0) return ''
      const kb = bytes / 1024
      return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(kb)) + ' KB'
    }

    /** Host refusals arrive as stable codes; everything else keeps its text. */
    function describeError(problem) {
      if (problem && problem.code === 'running') return t('errRunning')
      if (problem && problem.code === 'has-children') return t('errChildren', { n: problem.children ?? 0 })
      if (problem && problem.code === 'missing-session') return t('errMissing')
      if (problem && problem.code === 'not-attached') return t('errNotAttached')
      return t('failure', { error: (problem && problem.message) || String(problem) })
    }

    /* ---------------------------------------------------------------- icons */

    function PanelIcon({ size }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M2 5.2h12v7.3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z' }),
        h('path', { d: 'M2 5.2 3.2 2.6a1 1 0 0 1 .9-.6h7.8a1 1 0 0 1 .9.6L14 5.2' }),
        h('path', { d: 'M6.4 8.4h3.2' }),
      )
    }

    /* ------------------------------------------------------- menu actions */

    /**
     * Contribution for one clicked conversation.
     *
     * Hiding is reversible, so it runs immediately and offers an undo in the
     * shell's own notice. Deleting is not, so it opens a submenu whose only row
     * is the confirmation — the shipped popup has no dialog, and a native
     * confirm would look like a browser alert.
     */
    function sessionActions(target) {
      const sessionId = target.sessionId
      const displayTitle = target.displayTitle || t('untitled')
      return [
        {
          id: 'session-vault.hide',
          label: t('menuHide'),
          order: 900,
          separatorBefore: true,
          run: async () => {
            try {
              await hide(sessionId)
            } catch (problem) {
              services.contextMenus.notify(describeError(problem))
              return
            }
            services.contextMenus.notify(t('hideDone', { name: displayTitle }), true, {
              label: t('undo'),
              run: () => post(API + '/restore', { sessionId }),
              failureLabel: t('undoFailed'),
            })
          },
          failureLabel: t('menuHideFailed'),
        },
        {
          id: 'session-vault.digest',
          label: t('menuDigest'),
          order: 905,
          run: async () => {
            try {
              await post(API + '/digest', { sessionId })
            } catch (problem) {
              services.contextMenus.notify(describeError(problem))
              return
            }
            services.contextMenus.notify(t('digestDone', { name: displayTitle }), true)
          },
          failureLabel: t('digestFailed'),
        },
        {
          id: 'session-vault.delete',
          label: t('menuDelete'),
          order: 910,
          danger: true,
          children: [
            {
              id: 'session-vault.delete.confirm',
              label: t('menuDeleteConfirmItem', { name: displayTitle }),
              danger: true,
              run: async () => {
                try {
                  try {
                    await unarchive(sessionId)
                  } catch {}
                  await post(API + '/delete', { sessionId })
                } catch (problem) {
                  services.contextMenus.notify(describeError(problem))
                  return
                }
                services.contextMenus.notify(t('deleteDone', { name: displayTitle }), true, {
                  label: t('reload'),
                  run: () => window.location.reload(),
                  failureLabel: t('reload'),
                })
              },
              failureLabel: t('menuDeleteFailed'),
            },
          ],
        },
      ]
    }

    /* ----------------------------------------------------------------- page */

    const CSS = `
.dsv-view { height: 100%; overflow: auto; padding: 24px 28px; box-sizing: border-box;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); }
.dsv-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.dsv-title { font-size: 18px; font-weight: 600; }
.dsv-count { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsv-sub { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary);
  margin: 0 0 12px; max-width: 780px; }
.dsv-tools { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
.dsv-section-head { display: flex; align-items: baseline; gap: 10px; margin: 0 2px 8px; }
.dsv-section-title { font-size: 13px; font-weight: 600; }
.dsv-section-count { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsv-section-spacer { flex: 1; }
.dsv-group-toggle { display: inline-flex; align-items: baseline; gap: 8px; padding: 0;
  border: none; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.dsv-group-toggle:hover .dsv-section-title { text-decoration: underline; }
.dsv-list { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden;
  max-width: 980px; margin-bottom: 22px; }
.dsv-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1); }
.dsv-row:first-child { border-top: none; }
.dsv-main { flex: 1; min-width: 0; }
.dsv-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsv-meta { font-size: 11px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.dsv-btn { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: inherit; cursor: pointer; }
.dsv-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.dsv-btn[disabled] { opacity: .5; cursor: default; }
.dsv-danger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dsv-empty { padding: 40px 24px; text-align: center; font-size: 13px; max-width: 980px;
  color: var(--dsw-alias-label-secondary); border: 1px dashed var(--dsw-alias-border-l1);
  border-radius: 10px; margin-bottom: 22px; }
.dsv-note { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); max-width: 780px; }
.dsv-author { margin: 28px 0 8px; padding-top: 14px; max-width: 980px; font-size: 12px;
  color: var(--dsw-alias-label-secondary); border-top: 1px solid var(--dsw-alias-border-l1); }
.dsv-author-link { color: var(--dsw-alias-brand-primary); text-decoration: none; }
.dsv-author-link:hover { text-decoration: underline; }
.dsv-warn { font-size: 12px; margin: 0 0 12px; color: var(--dsw-alias-state-error-primary); }
.dsv-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 980px;
  margin: 0 0 16px; padding: 10px 14px; font-size: 12px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.dsv-notice { border-color: var(--dsw-alias-state-warn-primary); }
.dsv-card-goal { margin-top: 4px; font-size: 12px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary); }
.dsv-card-body { margin-top: 10px; padding-top: 10px; font-size: 12px; line-height: 1.7;
  white-space: pre-wrap; border-top: 1px dashed var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); }
.dsv-editor { width: 100%; min-height: 190px; margin-top: 6px; padding: 8px 10px;
  font: inherit; font-size: 12px; line-height: 1.6; resize: vertical; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary); }
.dsv-kv { margin: 6px 0; }
.dsv-k { margin-bottom: 2px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dsv-select { font: inherit; font-size: 12px; padding: 3px 6px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary); }
.dsv-backdrop { position: fixed; inset: 0; z-index: 2147483000; display: flex;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, .32); }
.dsv-modal { width: min(420px, calc(100vw - 48px)); padding: 18px 20px; border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary); box-shadow: 0 18px 40px rgba(0, 0, 0, .28); }
.dsv-modal-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.dsv-modal-body { font-size: 12.5px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.dsv-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
`

    function Styles() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } })
    }

    /** Promise-based confirmation rendered in the page, not by the browser. */
    function useDialog() {
      const [dialog, setDialog] = useState(null)
      const ask = useCallback(
        (spec) =>
          new Promise((resolve) => {
            setDialog({
              ...spec,
              settle: (ok) => {
                setDialog(null)
                resolve(ok)
              },
            })
          }),
        [],
      )

      useEffect(() => {
        if (!dialog) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') dialog.settle(false)
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [dialog])

      const node =
        dialog && typeof document !== 'undefined'
          ? createPortal(
              h(
                'div',
                {
                  className: 'dsv-backdrop',
                  onClick: (event) => {
                    if (event.target === event.currentTarget) dialog.settle(false)
                  },
                },
                h(
                  'div',
                  { className: 'dsv-modal', role: 'dialog', 'aria-modal': 'true' },
                  h('div', { className: 'dsv-modal-title' }, dialog.title),
                  h('div', { className: 'dsv-modal-body' }, dialog.body),
                  h(
                    'div',
                    { className: 'dsv-modal-actions' },
                    h(
                      'button',
                      { type: 'button', className: 'dsv-btn', onClick: () => dialog.settle(false) },
                      t('cancel'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsv-btn ' + (dialog.danger ? 'dsv-danger' : ''),
                        onClick: () => dialog.settle(true),
                      },
                      dialog.confirmLabel || t('confirm'),
                    ),
                  ),
                ),
              ),
              document.body,
            )
          : null
      return { ask, node }
    }

    function VaultPage(props) {
      const archivedIds = props.useWorkspaces((state) => state.archivedSessionIds)
      const workspaces = props.useWorkspaces((state) => state.items)
      const { ask, node: dialogNode } = useDialog()

      const [phase, setPhase] = useState('loading')
      const [items, setItems] = useState([])
      const [digests, setDigests] = useState([])
      const [trash, setTrash] = useState([])
      const [expanded, setExpanded] = useState('')
      const [editingId, setEditingId] = useState('')
      const [draft, setDraft] = useState({ title: '', body: '' })
      const [renamingId, setRenamingId] = useState('')
      const [renameDraft, setRenameDraft] = useState('')
      const [collapsed, setCollapsed] = useState({})
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [busy, setBusy] = useState('')
      const [picker, setPicker] = useState(null)
      const [targetWorkspace, setTargetWorkspace] = useState('')
      const mounted = useRef(true)

      useEffect(() => {
        mounted.current = true
        return () => {
          mounted.current = false
        }
      }, [])

      const load = useCallback(async () => {
        setPhase((current) => (current === 'ready' ? current : 'loading'))
        try {
          const body = await call(API + '/list')
          if (!mounted.current) return
          const rows = Array.isArray(body.items) ? body.items : []
          // This page needs the Host build that reports `attached`; an older Host
          // renders as an empty vault, which is worse than saying so.
          if (rows.some((item) => typeof item.attached !== 'boolean')) {
            setError(t('staleHost'))
            setPhase('failed')
            return
          }
          setItems(rows)
          setError('')
          setNotice(null)
          setPhase('ready')
          try {
            const cards = await call(API + '/digests')
            if (mounted.current) setDigests(Array.isArray(cards.items) ? cards.items : [])
          } catch {
            if (mounted.current) setDigests([])
          }
          try {
            const bin = await call(API + '/digests/trash')
            if (mounted.current) setTrash(Array.isArray(bin.items) ? bin.items : [])
          } catch {
            if (mounted.current) setTrash([])
          }
        } catch (problem) {
          if (!mounted.current) return
          setError(problem.message)
          setPhase('failed')
        }
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const archivedSet = new Set((archivedIds || []).map(String))
      const byId = new Map(items.map((item) => [String(item.id), item]))

      // Detached sessions belong here even when their workspace is gone, so the
      // restore picker can re-home them. Probe sessions that plugins create under
      // a temporary directory are noise, not conversations. A row that is somehow
      // both detached and archived stays in the archive section only.
      const looksTemporary = (path) => path === '' || /[\\/]temp[\\/]/i.test(path)
      const hiddenRows = items
        .filter(
          (item) =>
            item.attached === false &&
            !archivedSet.has(String(item.id)) &&
            (item.workspaceId || !looksTemporary(item.cwd)),
        )
        .map((item) => ({
          id: String(item.id),
          title: item.title || '',
          updatedAt: item.createdAt || 0,
          sizeBytes: item.sizeBytes,
          workspaceId: item.workspaceId || '',
          kind: 'hidden',
          group: item.workspaceTitle || t('groupGone'),
        }))

      const archivedRows = []
      for (const id of archivedIds || []) {
        const item = byId.get(String(id))
        if (!item) continue
        archivedRows.push({
          id: String(id),
          title: item.title || '',
          updatedAt: item.createdAt || 0,
          sizeBytes: item.sizeBytes,
          workspaceId: item.workspaceId || '',
          attached: item.attached !== false,
          kind: 'archived',
          group: item.workspaceTitle || t('groupGone'),
        })
      }

      const groupRows = (rows) => {
        const map = new Map()
        for (const row of rows) {
          if (!map.has(row.group)) map.set(row.group, [])
          map.get(row.group).push(row)
        }
        return [...map.entries()].map(([title, members]) => {
          members.sort((a, b) => b.updatedAt - a.updatedAt)
          return { title, rows: members }
        })
      }

      const restore = async (row) => {
        setBusy(row.id)
        try {
          if (row.kind === 'archived') {
            await unarchive(row.id)
            // An archived row can also have been detached; re-home it when the
            // original workspace is still known, otherwise ask which one.
            if (row.attached === false) {
              if (row.workspaceId) {
                await post(API + '/restore', { sessionId: row.id, workspaceId: row.workspaceId })
              } else {
                setBusy('')
                setTargetWorkspace('')
                setPicker(row)
                return
              }
            }
          } else if (row.workspaceId) {
            await post(API + '/restore', { sessionId: row.id, workspaceId: row.workspaceId })
          } else {
            setBusy('')
            setTargetWorkspace('')
            setPicker(row)
            return
          }
          await load()
        } catch (problem) {
          setNotice({ text: describeError(problem) })
        } finally {
          setBusy('')
        }
      }

      const removeRow = async (row) => {
        const ok = await ask({
          title: t('dialogDeleteTitle'),
          body: t('dialogDeleteBody', { name: row.title || t('untitled') }),
          danger: true,
          confirmLabel: t('remove'),
        })
        if (!ok) return
        setBusy(row.id)
        try {
          if (row.kind === 'archived') {
            try {
              await unarchive(row.id)
            } catch {}
          }
          await post(API + '/delete', { sessionId: row.id })
          await load()
          setNotice({ text: t('deletedSidebarHint'), action: { label: t('reload'), run: () => window.location.reload() } })
        } catch (problem) {
          setNotice({ text: describeError(problem) })
        } finally {
          setBusy('')
        }
      }

      const clearGroup = async (group) => {
        const ok = await ask({
          title: t('dialogClearTitle'),
          body: t('dialogClearBody', { group: group.title, n: group.rows.length }),
          danger: true,
          confirmLabel: t('clearGroup'),
        })
        if (!ok) return
        setBusy('group:' + group.title)
        try {
          for (const row of group.rows) {
            if (row.kind === 'archived') {
              try {
                await unarchive(row.id)
              } catch {}
            }
            await post(API + '/delete', { sessionId: row.id })
          }
        } catch (problem) {
          setNotice({ text: describeError(problem) })
        } finally {
          setBusy('')
          await load()
          setNotice({ text: t('deletedSidebarHint'), action: { label: t('reload'), run: () => window.location.reload() } })
        }
      }

      const deleteCard = async (card) => {
        const ok = await ask({
          title: t('cardDelete'),
          body: card.title || t('untitled'),
          danger: true,
          confirmLabel: t('remove'),
        })
        if (!ok) return
        try {
          await post(API + '/digests/delete', { id: card.id })
          await load()
        } catch (problem) {
          setNotice({ text: describeError(problem) })
        }
      }

      const startEdit = (card) => {
        setEditingId(card.id)
        setDraft({ title: card.title || '', body: card.body || '' })
      }

      const saveEdit = async (card) => {
        try {
          await post(API + '/digests/save', {
            id: card.id,
            title: draft.title,
            body: draft.body,
          })
          setEditingId('')
          await load()
        } catch (problem) {
          setNotice({ text: describeError(problem) })
        }
      }

      const renderCard = (card) => {
        const open = expanded === card.id
        const editing = editingId === card.id
        const meta = [card.workspace, timeLabel(Date.parse(card.updated || card.created))]
          .filter(Boolean)
          .join(' · ')
        return h(
          'div',
          { key: card.id, className: 'dsv-row', style: { alignItems: 'flex-start' } },
          h(
            'div',
            { className: 'dsv-main' },
            editing
              ? h(
                  'div',
                  {},
                  h('input', {
                    className: 'dsv-select',
                    style: { width: '100%', marginBottom: 8 },
                    value: draft.title,
                    onChange: (event) => setDraft({ ...draft, title: event.target.value }),
                  }),
                  h('textarea', {
                    className: 'dsv-editor',
                    value: draft.body,
                    onChange: (event) => setDraft({ ...draft, body: event.target.value }),
                  }),
                )
              : h(
                  'div',
                  {},
                  h('div', { className: 'dsv-name' }, card.title || t('untitled')),
                  h('div', { className: 'dsv-meta' }, meta),
                  open && !editing
                    ? h('div', { className: 'dsv-card-body' }, card.body || t('cardEmptyBody'))
                    : null,
                ),
          ),
          editing
            ? h(
                React.Fragment,
                null,
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn', onClick: () => saveEdit(card) },
                  t('cardSave'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn', onClick: () => setEditingId('') },
                  t('cancel'),
                ),
              )
            : h(
                React.Fragment,
                null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsv-btn',
                    onClick: () => setExpanded(open ? '' : card.id),
                  },
                  open ? t('cardCollapse') : t('cardExpand'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn', onClick: () => startEdit(card) },
                  t('cardEdit'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn dsv-danger', onClick: () => deleteCard(card) },
                  t('cardDelete'),
                ),
              ),
        )
      }

      const startRename = (row) => {
        setRenamingId(row.id)
        setRenameDraft(row.title || '')
      }

      const commitRename = async (row) => {
        const title = renameDraft.trim()
        if (!title) return
        try {
          const result = await services.sessions.using(
            row.id,
            { source: 'workspaceOperation' },
            (reference) => reference.binding.session.rename(title),
          )
          if (result && result.ok === false) {
            throw new Error((result.error && result.error.message) || 'rename failed')
          }
          setRenamingId('')
          await load()
        } catch (problem) {
          setNotice({ text: describeError(problem) })
        }
      }

      const isCollapsed = (key, count) => {
        const value = collapsed[key]
        return value === undefined ? count > 6 : value
      }

      const toggleGroup = (key, count) => {
        setCollapsed({ ...collapsed, [key]: !isCollapsed(key, count) })
      }

      const renderRow = (row) =>
        h(
          'div',
          { key: row.id, className: 'dsv-row' },
          h(
            'div',
            { className: 'dsv-main' },
            renamingId === row.id
              ? h('input', {
                  className: 'dsv-select',
                  style: { width: '100%' },
                  value: renameDraft,
                  autoFocus: true,
                  onChange: (event) => setRenameDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') commitRename(row)
                    if (event.key === 'Escape') setRenamingId('')
                  },
                })
              : h('div', { className: 'dsv-name' }, row.title || t('untitled')),
            h(
              'div',
              { className: 'dsv-meta' },
              [
                row.kind === 'archived' ? t('kindArchived') : t('kindHidden'),
                timeLabel(row.updatedAt),
                sizeLabel(row.sizeBytes),
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          ),
          renamingId === row.id
            ? h(
                React.Fragment,
                null,
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn', onClick: () => commitRename(row) },
                  t('rowSave'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn', onClick: () => setRenamingId('') },
                  t('cancel'),
                ),
              )
            : h(
                React.Fragment,
                null,
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn', onClick: () => startRename(row) },
                  t('rowRename'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn', disabled: busy !== '', onClick: () => restore(row) },
                  t('restore'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsv-btn dsv-danger',
                    disabled: busy !== '',
                    onClick: () => removeRow(row),
                  },
                  t('remove'),
                ),
              ),
        )

      const renderGroup = (group, key) => {
        // Key the collapse state by section + group title, not by list index:
        // a group that disappears must not hand its state to its neighbour.
        const groupKey = `${String(key).slice(0, 1)}:${group.title}`
        const closed = isCollapsed(groupKey, group.rows.length)
        return h(
          'div',
          { key },
          h(
            'div',
            { className: 'dsv-section-head' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsv-group-toggle',
                onClick: () => toggleGroup(groupKey, group.rows.length),
                title: closed ? t('cardExpand') : t('cardCollapse'),
              },
              h('span', {}, closed ? '▸' : '▾'),
              h('span', { className: 'dsv-section-title' }, group.title || t('groupFallback')),
              h('span', { className: 'dsv-section-count' }, t('count', { n: group.rows.length })),
            ),
            h('span', { className: 'dsv-section-spacer' }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsv-btn dsv-danger',
                disabled: busy !== '',
                onClick: () => clearGroup(group),
              },
              t('clearGroup'),
            ),
          ),
          closed ? null : h('div', { className: 'dsv-list' }, group.rows.map(renderRow)),
        )
      }

      const hiddenGroups = groupRows(hiddenRows)
      const archivedGroups = groupRows(archivedRows)
      const total = hiddenRows.length + archivedRows.length

      const noticeNode = notice
        ? h(
            'div',
            { className: 'dsv-picker dsv-notice' },
            h('span', {}, notice.text),
            notice.action
              ? h(
                  'button',
                  { type: 'button', className: 'dsv-btn', onClick: () => notice.action.run() },
                  notice.action.label,
                )
              : null,
            h(
              'button',
              { type: 'button', className: 'dsv-btn', onClick: () => setNotice(null) },
              t('dismiss'),
            ),
          )
        : null

      const pickerNode = picker
        ? h(
            'div',
            { className: 'dsv-picker' },
            h('span', {}, t('pickerHint')),
            h(
              'select',
              {
                className: 'dsv-select',
                value: targetWorkspace,
                onChange: (event) => setTargetWorkspace(event.target.value),
              },
              h('option', { value: '' }, '—'),
              (workspaces || []).map((workspace) =>
                h(
                  'option',
                  { key: String(workspace.workspaceId), value: String(workspace.workspaceId) },
                  workspace.title || workspace.path,
                ),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsv-btn',
                disabled: !targetWorkspace || busy !== '',
                onClick: async () => {
                  setBusy(picker.id)
                  try {
                    await post(API + '/restore', {
                      sessionId: picker.id,
                      workspaceId: targetWorkspace,
                    })
                    setPicker(null)
                    await load()
                  } catch (problem) {
                    setNotice({ text: describeError(problem) })
                  } finally {
                    setBusy('')
                  }
                },
              },
              t('pickerApply'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsv-btn', onClick: () => setPicker(null) },
              t('cancel'),
            ),
          )
        : null

      const body =
        phase === 'loading'
          ? h('div', { className: 'dsv-empty' }, t('loading'))
          : phase === 'failed'
            ? h(
                'div',
                {},
                h('p', { className: 'dsv-warn' }, t('failed', { error })),
                h(
                  'button',
                  { type: 'button', className: 'dsv-btn', onClick: load },
                  t('retry'),
                ),
              )
            : h(
                'div',
                {},
                h('div', { className: 'dsv-section-head' }, h('span', { className: 'dsv-section-title' }, t('hiddenSection'))),
                hiddenGroups.length === 0
                  ? h('div', { className: 'dsv-empty' }, t('hiddenEmpty'))
                  : hiddenGroups.map((group, index) => renderGroup(group, 'h' + index)),
                h('div', { className: 'dsv-section-head' }, h('span', { className: 'dsv-section-title' }, t('archivedSection'))),
                h('p', { className: 'dsv-note', style: { margin: '0 2px 8px' } }, t('archiveNote')),
                archivedGroups.length === 0
                  ? h('div', { className: 'dsv-empty' }, t('archivedEmpty'))
                  : archivedGroups.map((group, index) => renderGroup(group, 'a' + index)),
                h('p', { className: 'dsv-note' }, t('groupNote')),
                h(
                  'div',
                  { className: 'dsv-section-head', style: { marginTop: 18 } },
                  h('span', { className: 'dsv-section-title' }, t('cardSection')),
                  h(
                    'span',
                    { className: 'dsv-section-count' },
                    digests.length ? t('count', { n: digests.length }) : '',
                  ),
                ),
                digests.length === 0
                  ? h('div', { className: 'dsv-empty' }, t('cardEmpty'))
                  : h('div', { className: 'dsv-list' }, digests.map(renderCard)),
                trash.length
                  ? h(
                      'div',
                      {},
                      h(
                        'div',
                        { className: 'dsv-section-head', style: { marginTop: 18 } },
                        h('span', { className: 'dsv-section-title' }, t('trashSection')),
                        h('span', { className: 'dsv-section-count' }, t('count', { n: trash.length })),
                      ),
                      h(
                        'div',
                        { className: 'dsv-list' },
                        trash.map((entry) =>
                          h(
                            'div',
                            { className: 'dsv-row', key: entry.file },
                            h(
                              'div',
                              { className: 'dsv-row-main' },
                              h('div', { className: 'dsv-row-title' }, entry.title || t('untitled')),
                              h('div', { className: 'dsv-row-meta' }, entry.excerpt || ''),
                            ),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'dsv-btn',
                                onClick: async () => {
                                  try {
                                    await post(API + '/digests/trash/restore', { file: entry.file })
                                    await load()
                                    setNotice({ text: t('trashRestored', { title: entry.title || t('untitled') }) })
                                  } catch (problem) {
                                    setNotice({ text: describeError(problem) })
                                  }
                                },
                              },
                              t('restore'),
                            ),
                          ),
                        ),
                      ),
                    )
                  : null,
              )

      return h(
        'div',
        { className: 'dsv-view' },
        h(Styles),
        h(
          'div',
          { className: 'dsv-head' },
          h('span', { className: 'dsv-title' }, t('title')),
          h('span', { className: 'dsv-count' }, total ? t('count', { n: total }) : ''),
        ),
        h('p', { className: 'dsv-sub' }, t('intro')),
        h(
          'div',
          { className: 'dsv-tools' },
          h('button', { type: 'button', className: 'dsv-btn', onClick: load }, t('refresh')),
          h(
            'button',
            { type: 'button', className: 'dsv-btn', onClick: () => window.location.reload() },
            t('reloadPage'),
          ),
        ),
        noticeNode,
        pickerNode,
        body,
        h(
          'p',
          { className: 'dsv-author' },
          t('authorLabel') + ' ',
          h(
            'a',
            { href: AUTHOR.url, target: '_blank', rel: 'noreferrer noopener', className: 'dsv-author-link' },
            AUTHOR.name,
          ),
          ' · ' + AUTHOR.site,
        ),
        dialogNode,
      )
    }

    /* --------------------------------------------------------------- module */

    function register(ctx) {
      const slots = ctx.slots
      const disposers = [
        slots.inject('sidebar.panellist', () =>
          slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 5, label: () => t('title') },
            PanelIcon,
          ),
        ),
        slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID }, VaultPage)),
        ctx.contextMenus.register({
          id: 'session-vault',
          target: 'session',
          order: 900,
          resolve: (target) => sessionActions(target),
        }),
      ]
      return () => {
        for (const dispose of disposers.splice(0)) {
          try {
            dispose()
          } catch {}
        }
      }
    }

    return {
      inject: ['slots', 'workspaces', 'contextMenus', 'sessions'],
      apply(ctx) {
        services = ctx
        ctx.effect(() => register(ctx))
      },
    }
  },
})
