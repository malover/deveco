---
name: gitcode-pr
description: 按仓库 DEV-WORKFLOW.md 完成 DevEco Code 的 GitCode 提交、推送、上游 Issue/PR 关联及 CI 触发。当用户在 DevEco Code 或 openharmony-sig/deveco-code 仓库上下文中要求提交代码、提交当前改动、创建提交、推送代码或创建 PR 时使用；即使用户未提及 GitCode 或 PR，只要要求提交代码也必须触发。执行后必须先验证 GitCode MCP；功能分支固定基于父仓库 develop，推送到 origin，不验证 Fork 关系。
---

# DevEco Code GitCode 提交流程

使用中文与用户沟通。按顺序执行门禁；任一门禁失败，立即停止依赖它的操作。

## 0. GitCode MCP 门禁

触发本 skill 后，将 `gitcode_get_user` 作为任务执行阶段的第一个检查。在调用成功并返回已认证用户前，不得检查仓库、文件、Git、网络、配置或本地 MCP 服务，也不得执行任何写操作。

- 工具缺失、不可调用、报错或认证失败：立即停止提交与 PR 流程，简要报告原因，并主动询问用户是否现在开始配置 GitCode MCP。此时不得继续任何仓库检查或写操作。
- 不得用其他 GitCode 工具、HTTP、Git 命令、本地进程或配置检查替代本门禁。
- 常规提交或 PR 任务不得安装依赖、修改 MCP 配置、索取或回显 Token。
- 询问配置时，使用可直接回答“是/否”的单一问题；不得把配置视为默认授权。
- 用户明确同意后，将该回复视为配置授权，读取并执行 [GitCode MCP 配置](references/mcp-setup.md)；配置成功后重新从 `gitcode_get_user` 门禁开始。
- 用户拒绝、未作答或配置失败时停止，不得继续提交与 PR 流程。仅当用户明确要求安装、配置、修复 GitCode MCP，或明确同意上述询问时，才可读取配置指引。

本门禁优先于下述所有仓库与工作流检查。若系统或开发者级指令禁止调用该工具，报告冲突并停止，不得转做其他检查。

## 1. 仓库与规则门禁

通过 MCP 门禁后，仅执行只读检查，直至本节全部通过：

1. 定位仓库根目录，完整读取当前版本的 `DEV-WORKFLOW.md`；不得依赖记忆、摘要、历史会话或旧版本。
2. 确认 `origin`、工作区、暂存区和 Git 用户身份；保留无关的已暂存、未暂存和未跟踪文件。
3. 提取并应用分支命名、Commit 标题与正文、提交粒度、必做检查及 Issue/PR 流程。
4. 按当前指令优先级执行：系统、开发者及适用的 `AGENTS.md` 高于本 skill；本 skill 的固定约束高于 `DEV-WORKFLOW.md` 的普通约定。

`DEV-WORKFLOW.md` 缺失、无法完整读取、含义不明确或规则冲突时，列出相关原文与影响并请求用户裁决。门禁通过前不得切换或创建分支、暂存、提交、推送、创建 Issue/PR，或执行其他写操作。

## 固定约束

- 父项目：`openharmony-sig/deveco-code`
- 父项目 URL：`https://gitcode.com/openharmony-sig/deveco-code.git`
- 分支基线和 PR 目标：父项目 `develop`
- 推送目标：`origin`；不得验证或推断其 Fork 关系，不得向父项目推送

## 2. 基线与分支

1. 调用 `gitcode_get_branch` 获取父项目 `develop` 的提交哈希。
2. 运行：

   ```bash
   git fetch --no-tags https://gitcode.com/openharmony-sig/deveco-code.git refs/heads/develop
   ```

3. 验证 `FETCH_HEAD` 与 MCP 哈希一致。不得新增父项目 remote，不得用本地或 `origin/develop` 替代。
4. 运行 `git switch --create <feature_branch> FETCH_HEAD` 并验证起点。不得复用、重置或覆盖同名本地分支。

允许 Git 保留不冲突的未提交改动。切换失败时停止；不得 stash、丢弃、覆盖、merge、rebase、reset 或强制切换。

## 3. 提交与推送

1. 只暂存用户确认的路径；不得使用 `git add -A`。
2. 按 `DEV-WORKFLOW.md` 完成必做检查并生成 Commit 标题与正文。
3. 使用 Git 用户身份生成 `Signed-off-by`；允许存在 `Co-authored-by`。
4. 保持仓库 hooks 启用，使用 `git commit -s`，不得默认绕过 hook。
5. 验证提交内容、trailers 和签名后，运行 `git push --set-upstream origin <feature_branch>`。

hook、检查、提交验证或推送失败时停止后续流程。

## 4. Issue 与 PR

1. 查询 `<origin_owner>:<feature_branch>` → `develop` 的开放 PR；存在时复用，不重复创建。
2. 不存在时，按提交类型选择上游 Issue 模板：`feat` → `feature-request`、`fix` → `bug-report`、`docs` → `document`、`refactor` → `refactor`、`chore|test` → `question`。
3. 优先使用 `.gitcode/ISSUE_TEMPLATE/`，其次使用 `.github/ISSUE_TEMPLATE/`。保留模板默认值，只填写已验证信息，缺失项写 `未提供`。
4. 创建 Issue 和 PR，创建Issue时不指定负责人，先调用 `gitcode_link_pull_issues`，再用 `gitcode_list_pull_issues` 验证关联。

模板、创建或关联验证失败时停止。

## 5. CI 构建

仅处理本次新建的 PR：

1. 创建 PR 后立即查询评论；之后每 30 秒查询一次，最多等待 3 分钟。
2. 仅接受作者为 `openharmony_ci` 且正文包含 `感谢提交 Pull Requests` 的评论。
3. 评论出现后，若认证用户尚未发送正文精确等于 `start build` 的评论，则发送一次并再次查询验证。
4. 等待超时不得发送构建指令。

## 结果报告

报告 MCP 用户、基线哈希、本地分支起点、提交、hooks、推送分支、Issue/PR、关联、CI 评论及构建指令状态。失败时同时报告停止阶段、原因和相关路径。
