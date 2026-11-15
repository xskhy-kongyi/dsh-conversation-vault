# 发布清单

代码侧已完成，只剩需要你账号的几步。

## 已定名字

| 项 | 值 |
|---|---|
| npm 包名 / 仓库名 | `dsh-conversation-vault`（无 scope，npm 上已确认可用） |
| GitHub 仓库 | `https://github.com/xskhy-kongyi/dsh-conversation-vault` |
| 插件行 id | `session-vault`（内部，不变） |

> 备选：`dsh-session-vault` / `dsh-vault` / `dsh-memory-vault` 都已被别人占用。

## 1. 建 GitHub 仓库并推送

在 <https://github.com/new> 建仓库：

- 名称：`dsh-conversation-vault`
- 可见性：**Public**
- 不要勾 README / .gitignore / license（本地已有）

```powershell
cd E:\文件\DSH_TUOZHAN\dsh-session-vault
git remote add origin https://github.com/xskhy-kongyi/dsh-conversation-vault.git
git push -u origin main
```

## 2. 加 topic

仓库页 → About 齿轮 → Topics → 加 `dsh-plugin` → 保存。

## 3. （可选）发 npm

```powershell
npm login
cd E:\文件\DSH_TUOZHAN\dsh-session-vault
npm publish --access public
```

## 4. 等满 1 天

市场 CI 会查仓库创建时间。

## 5. 提交市场 PR

1. Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
2. 新增 `data/plugins/xskhy-kongyi__dsh-conversation-vault.yml`
3. 内容复制 `E:\文件\DSH_TUOZHAN\market\xskhy-kongyi__dsh-conversation-vault.yml`
4. 提 PR，标题：`Add dsh-conversation-vault`

## 可能被人工复核的点

- **删除会话日志目录**被安全扫描归为“破坏性操作”（警告级）。
- **HTTP 路由没有 DSH 访问检查**（只监听 127.0.0.1），注册表通常会在条目描述里补一句提示。

想更稳可以先补路由鉴权（D1）。

## 装回自己的机器

当前 profile 里仍是本地 link。发布后：

```powershell
dsh plugin --profile desktop remove dsh-conversation-vault
dsh plugin --profile desktop add dsh-conversation-vault
```
