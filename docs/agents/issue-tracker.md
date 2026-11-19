# Issue tracker: GitHub

本仓库的 issue 与 spec 记录为 GitHub issue，目标仓库是 **WallBreakerNO4/sharkord**（本 clone 的 origin）。所有操作使用 `gh` CLI。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文用 heredoc。
- **读取 issue**：`gh issue view <number> --json number,title,body,labels,comments`。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需加 `--label` 和 `--state` 过滤。
- **把 issue 挂为父 issue 的子 issue**：`gh issue create --parent <parent> ...`，或事后 `gh issue edit <parent> --add-sub-issue <child>`（gh 2.94+）。旧版 gh：`gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`（数据库 id，见下方 Blocking）。不支持子 issue 时，在子 issue 正文顶部写 `Part of #<parent>`。
- **Blocking**：GitHub 的**原生 issue 依赖**，UI 可见的权威表示。用 `gh issue create --blocked-by <n>,<n> ...` 或 `gh issue edit <child> --add-blocked-by <blocker>` 加边（gh 2.94+）。旧版 gh：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞方的数字**数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`），不是 `#number` 也不是 node_id。依赖不可用时，退回在子 issue 正文顶部写 `Blocked by: #<n>, #<n>`。所有阻塞方关闭后票才算解除阻塞。
- **统计未关闭的阻塞方**：`gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by`（只算未关闭的；0 即可开工）。`gh issue view <n> --json blockedBy` 会连已关闭的一起列，要过滤：`--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`。
- **评论 issue**：`gh issue comment <number> --body "..."`。
- **打 / 移除标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`。
- **关闭**：先用 `gh issue comment <number> --body "..."` 发解释，再 `gh issue close <number>`。对已关闭的 issue，`gh issue close --comment` 会丢掉评论但仍以退出码 0 结束。

仓库从 `git remote -v` 推断；在 clone 内 `gh` 会自动完成，默认跟随 origin，也就是本仓库的目标。fork 场景仍可能出岔：每次会话第一次 `gh issue create` 之前，用 `gh repo view --json nameWithOwner` 核对目标是 WallBreakerNO4/sharkord，不是就先向用户确认。

只把 issue 建到用户自己的仓库。绝不建到 `mattpocock/skills`（这些 skill 的来源仓库），除非用户本人拥有它。

## Pull request 作为 triage 面

**PRs as a request surface: no.**（若本仓库把外部 PR 当功能请求处理，改成 yes；`/triage` 会读这个标记。）

设为 yes 时，PR 走与 issue 相同的标签与状态，用 `gh pr` 等价命令：

- **读取 PR**：`gh pr view <number>`，然后 `gh pr view <number> --comments`（非 TTY 下 `--comments` 只打印评论不打印正文），以及 `gh pr diff <number>` 看 diff。
- **列出外部 PR 供 triage**：`gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`。
- **评论 / 打标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的编号空间 issue 和 PR 共用，光一个 `#42` 可能是两者之一：用 `gh pr view 42` 试，不行再 `gh issue view 42`。

## 当 skill 说「发布到 issue tracker」

创建一个 GitHub issue。

## 当 skill 说「获取相关工单」

按上方**读取 issue**的方式读。

## Wayfinder 操作

供 `/wayfinder` 使用。map 是单一 issue，子 issue 是工单。

- **Map**：单一 issue，标签 `wayfinder:map`，正文装 Notes / Decisions-so-far / Fog。`gh issue create --label wayfinder:map`。
- **子工单**：作为 GitHub sub-issue 链到 map 上（见**把 issue 挂为父 issue 的子 issue**）。sub-issue 不可用时，把子工单加进 map 正文的 task list，并在子工单正文顶部写 `Part of #<map>`。标签：`wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。认领后把工单 assign 给驱动的开发者。
- **Blocking**：见约定里的 **Blocking**。
- **Frontier 查询**：列出 map 的未关闭子工单（`gh issue list --state open`，限定到 map 的 sub-issue / task list），丢掉有未关闭阻塞方（见**统计未关闭的阻塞方**，或正文里有未关闭的 `Blocked by` 行）或已有 assignee 的；按 map 里的顺序取第一个。
- **认领**：`gh issue edit <n> --add-assignee @me`，这是本会话的第一个写操作。
- **解决**：`gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，最后把上下文指针（gist + 链接）追加到 map 的 Decisions-so-far。
