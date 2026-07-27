# GitCode MCP 配置指引

仅在用户明确要求安装、配置或修复 GitCode MCP 时读取并执行本指引。常规 GitCode 提交与 PR 流程只检查工具和认证，不得自动进入配置流程。

## 内置服务

1. 将 `<skill_root>` 解析为本文件上一级目录所对应 Skill 的绝对目录，并将 `<skill_root>/mcp_server/server.py` 作为唯一服务端入口。
2. 不得检查、克隆、更新或修复外部 GitCode MCP 源码项目，也不得复用旧 MCP 配置中的外部服务路径。

## 安装依赖

1. 检查 `<skill_root>/mcp_server/.venv`。存在时验证其 Python 与依赖；不存在时报告 **需要安装 GitCode MCP**，并在创建文件或下载依赖前征得用户明确授权。
2. 使用 Python 3.10+ 创建虚拟环境并安装内置依赖：
   - Windows：
     - `python -m venv <skill_root>\mcp_server\.venv`
     - `<skill_root>\mcp_server\.venv\Scripts\python.exe -m pip install -r <skill_root>\mcp_server\requirements.txt`
   - macOS/Linux：
     - `python3 -m venv <skill_root>/mcp_server/.venv`
     - `<skill_root>/mcp_server/.venv/bin/python -m pip install -r <skill_root>/mcp_server/requirements.txt`
3. 运行虚拟环境 Python 的 `-m pip check` 验证依赖。
4. 不得把虚拟环境、Token、安装日志或缓存提交到目标项目；虚拟环境只能位于本 Skill 的 `mcp_server/.venv`。

## 配置 OpenCode

在修改用户级配置前征得用户明确授权。随后只初始化或更新 `~/.config/opencode/opencode.json` 或 `~/.config/opencode/opencode.jsonc` 中的 `mcp.gitcode`，不得影响其他配置：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "gitcode": {
      "type": "local",
      "command": [
        "<skill_root>/mcp_server/.venv/<平台 Python 路径>",
        "<skill_root>/mcp_server/server.py"
      ],
      "environment": {
        "GITCODE_TOOLSETS": "extended,gitcode_list_pull_comments,gitcode_link_pull_issues,gitcode_list_pull_issues"
        // 没有现成 Token 时，由用户在此处添加：
        // "GITCODE_TOKEN": "<GitCode Personal Access Token>"
      }
    }
  }
}
```

不得检查或复用旧服务路径。配置完成但缺少 Token 时报告 **需要 Token**，请求用户安全提供，或告知其编辑 `mcp.gitcode.environment.GITCODE_TOKEN`。绝不打印、复制到项目文件或在对话中回显 Token。

完成配置后要求用户重启 OpenCode 或新开任务，再调用 `gitcode_get_user` 验证。验证成功时报告 **GitCode MCP 已可用**；仍失败时停止并报告原始错误，但不得泄露 Token。
