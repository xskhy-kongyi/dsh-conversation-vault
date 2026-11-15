# 发布清单

所有本机能做的都已完成。下面按顺序执行，只有标 🔑 的步骤需要你的账号。

## 0. 已完成（我做的）

- 包名改为 `@kongyi/dsh-session-vault`，`repository` / `homepage` / `bugs` 指向 `github.com/kongyi/dsh-session-vault`
- `cordis.patch.yml` 与客户端模块 id 同步改名
- `README.md`（安装 + 功能 + 数据位置 + 限制）、`LICENSE`（MIT）、`.gitignore`
- 打包验证通过：tarball 只含 10 个必要文件
- 本地 git 仓库已初始化并完成首次提交（见第 1 步）

## 1. 🔑 建 GitHub 仓库并推送

在 <https://github.com/new> 建仓库：

- 名称：`dsh-session-vault`
- 可见性：**Public**
- **不要**勾选 “Add a README file / .gitignore / license”（本地已有）
- 你的账号名必须是 `kongyi`；如果不是，先改三处：`package.json` 的 `name`、`repository`、`homepage`，以及 `cordis.patch.yml`、`client.js` 里的模块 id

```powershell
cd E:\文件\DSH_TUOZHAN\dsh-session-vault
git remote add origin https://github.com/kongyi/dsh-session-vault.git
git push -u origin main
```

## 2. 🔑 给仓库加 topic

仓库页面 → About 右侧齿轮 → Topics → 加 `dsh-plugin` → 保存。

（这是市场 CI 的必查项。）

## 3. 🔑（可选）发布到 npm

只想用 GitHub 安装可以跳过。

```powershell
npm login                       # 账号名建议 kongyi，才能用 @kongyi scope
cd E:\文件\DSH_TUOZHAN\dsh-session-vault
npm publish --access public
```

## 4. ⏳ 等满 1 天

市场 CI 会检查仓库创建时间是否满 24 小时。

## 5. 🔑 提交市场 PR

1. Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
2. 只新增一个文件：`data/plugins/kongyi__dsh-session-vault.yml`
3. 内容用本文件同目录的 `../market/kongyi__dsh-session-vault.yml`（已写好）
4. 提 PR

## 6. 审核时可能被指出的两点

- **删除会话日志目录**：安全扫描把它们归为“破坏性操作”，属警告级，会人工复核。条目描述里已写明“只删对话记录、不动文件”，并在 README 限制里交代。
- **HTTP 路由没有 DSH 访问检查**：只监听本机（127.0.0.1），注册表通常会在描述里加一句提示。

如果想在提交前把第二点消掉，可以做 D1：给四条路由加一次性 token。改动约 30 行，需要重启一次验证。

## 装回自己的机器

当前 profile 里装的还是旧的 `@local/dsh-session-vault`（本地 link）。发布后可以换成正式包：

```powershell
dsh plugin --profile desktop remove @local/dsh-session-vault
dsh plugin --profile desktop add @kongyi/dsh-session-vault
```

记忆卡不受影响——它们已在 `~/.dsh/storages/session-vault/`。
