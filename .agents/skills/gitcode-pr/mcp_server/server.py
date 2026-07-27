"""GitCode MCP Server — exposes GitCode.com API as MCP tools."""
import os
from typing import Optional
import aiohttp
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()
TOKEN = os.environ.get("GITCODE_TOKEN", "")
mcp = FastMCP("gitcode", dependencies=["aiohttp", "python-dotenv"])

_ALL_TOOLS: dict = {}


def _tool(func):
    _ALL_TOOLS[func.__name__] = func
    return func


async def _request(
    method: str,
    path: str,
    params: Optional[dict] = None,
    json_body: Optional[dict | list] = None,
) -> dict | list | str:
    """Authenticated request to GitCode API."""
    if path.startswith("/api/"):
        url = f"https://api.gitcode.com{path}"
    else:
        url = f"https://api.gitcode.com/api/v5{path}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    async with aiohttp.ClientSession() as session:
        async with session.request(
            method, url, headers=headers, params=params or {}, json=json_body
        ) as resp:
            if resp.status >= 400:
                return f"Error {resp.status}: {await resp.text()}"
            if "json" in (resp.content_type or ""):
                return await resp.json()
            return await resp.text()


# ── Repositories ──

@_tool
async def gitcode_get_repo(owner: str, repo: str) -> dict | list | str:
    """Get a repository."""
    return await _request("GET", f"/repos/{owner}/{repo}")


@_tool
async def gitcode_delete_repo(owner: str, repo: str) -> dict | list | str:
    """Delete a repository."""
    return await _request("DELETE", f"/repos/{owner}/{repo}")


@_tool
async def gitcode_update_repo(
    owner: str,
    repo: str,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    homepage: Optional[str] = None,
    private: Optional[bool] = None,
    has_issues: Optional[bool] = None,
    has_wiki: Optional[bool] = None,
    default_branch: Optional[str] = None,
) -> dict | list | str:
    """Update repository settings."""
    body = {}
    if name is not None: body["name"] = name
    if description is not None: body["description"] = description
    if homepage is not None: body["homepage"] = homepage
    if private is not None: body["private"] = private
    if has_issues is not None: body["has_issues"] = has_issues
    if has_wiki is not None: body["has_wiki"] = has_wiki
    if default_branch is not None: body["default_branch"] = default_branch
    return await _request("PATCH", f"/repos/{owner}/{repo}", json_body=body)


@_tool
async def gitcode_get_readme(
    owner: str, repo: str, *, ref: Optional[str] = None
) -> dict | list | str:
    """Get the README of a repository."""
    params = {}
    if ref is not None: params["ref"] = ref
    return await _request("GET", f"/repos/{owner}/{repo}/readme", params=params)


@_tool
async def gitcode_list_languages(owner: str, repo: str) -> dict | list | str:
    """List programming languages used in a repository."""
    return await _request("GET", f"/repos/{owner}/{repo}/languages")


@_tool
async def gitcode_list_contributors(owner: str, repo: str) -> dict | list | str:
    """List contributors of a repository."""
    return await _request("GET", f"/repos/{owner}/{repo}/contributors")


@_tool
async def gitcode_list_stargazers(
    owner: str, repo: str, *, page: Optional[int] = None, per_page: Optional[int] = None
) -> dict | list | str:
    """List users who starred a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/stargazers", params=params)


@_tool
async def gitcode_list_subscribers(
    owner: str, repo: str, *, page: Optional[int] = None, per_page: Optional[int] = None
) -> dict | list | str:
    """List users watching a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/subscribers", params=params)


@_tool
async def gitcode_list_forks(
    owner: str,
    repo: str,
    *,
    sort: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List forks of a repository."""
    params = {}
    if sort is not None: params["sort"] = sort
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/forks", params=params)


@_tool
async def gitcode_create_fork(
    owner: str, repo: str, *, organization: Optional[str] = None
) -> dict | list | str:
    """Fork a repository."""
    body = {}
    if organization is not None: body["organization"] = organization
    return await _request("POST", f"/repos/{owner}/{repo}/forks", json_body=body)


@_tool
async def gitcode_list_events(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
    limit: Optional[int] = None,
) -> dict | list | str:
    """List events for a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    if limit is not None: params["limit"] = limit
    return await _request("GET", f"/repos/{owner}/{repo}/events", params=params)


@_tool
async def gitcode_list_repo_notifications(
    owner: str,
    repo: str,
    *,
    unread: Optional[bool] = None,
    participating: Optional[bool] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List notifications for a repository."""
    params = {}
    if unread is not None: params["unread"] = unread
    if participating is not None: params["participating"] = participating
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/notifications", params=params)


@_tool
async def gitcode_mark_repo_notifications_read(owner: str, repo: str) -> dict | list | str:
    """Mark all notifications in a repository as read."""
    return await _request("PUT", f"/repos/{owner}/{repo}/notifications")


@_tool
async def gitcode_search_repos(
    q: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
    sort: Optional[str] = None,
    order: Optional[str] = None,
) -> dict | list | str:
    """Search repositories."""
    params = {"q": q}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    if sort is not None: params["sort"] = sort
    if order is not None: params["order"] = order
    return await _request("GET", "/search/repositories", params=params)


# ── Files & Contents ──

@_tool
async def gitcode_get_contents(
    owner: str, repo: str, path: str, *, ref: Optional[str] = None
) -> dict | list | str:
    """Get file or directory contents from a repository."""
    params = {}
    if ref is not None: params["ref"] = ref
    return await _request("GET", f"/repos/{owner}/{repo}/contents/{path}", params=params)


@_tool
async def gitcode_get_file_list(
    owner: str,
    repo: str,
    *,
    ref: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """Get a flat file list for a repository."""
    params = {}
    if ref is not None: params["ref"] = ref
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/file_list", params=params)


@_tool
async def gitcode_get_raw_file(
    owner: str, repo: str, path: str, *, ref: Optional[str] = None
) -> dict | list | str:
    """Get the raw content of a file."""
    params = {}
    if ref is not None: params["ref"] = ref
    return await _request("GET", f"/repos/{owner}/{repo}/raw/{path}", params=params)


@_tool
async def gitcode_get_blob(owner: str, repo: str, sha: str) -> dict | list | str:
    """Get a git blob by SHA."""
    return await _request("GET", f"/repos/{owner}/{repo}/git/blobs/{sha}")


@_tool
async def gitcode_get_tree(
    owner: str, repo: str, sha: str, *, recursive: Optional[bool] = None
) -> dict | list | str:
    """Get a git tree by SHA."""
    params = {}
    if recursive is not None: params["recursive"] = recursive
    return await _request("GET", f"/repos/{owner}/{repo}/git/trees/{sha}", params=params)


@_tool
async def gitcode_create_file(
    owner: str,
    repo: str,
    path: str,
    *,
    content: str,
    message: str,
    branch: Optional[str] = None,
    author_name: Optional[str] = None,
    author_email: Optional[str] = None,
) -> dict | list | str:
    """Create a new file in a repository."""
    body: dict = {"content": content, "message": message}
    if branch is not None: body["branch"] = branch
    if author_name is not None: body["author_name"] = author_name
    if author_email is not None: body["author_email"] = author_email
    return await _request("POST", f"/repos/{owner}/{repo}/contents/{path}", json_body=body)


@_tool
async def gitcode_update_file(
    owner: str,
    repo: str,
    path: str,
    *,
    content: str,
    sha: str,
    message: str,
    branch: Optional[str] = None,
    author_name: Optional[str] = None,
    author_email: Optional[str] = None,
) -> dict | list | str:
    """Update an existing file in a repository."""
    body: dict = {"content": content, "sha": sha, "message": message}
    if branch is not None: body["branch"] = branch
    if author_name is not None: body["author_name"] = author_name
    if author_email is not None: body["author_email"] = author_email
    return await _request("PUT", f"/repos/{owner}/{repo}/contents/{path}", json_body=body)


@_tool
async def gitcode_delete_file(
    owner: str,
    repo: str,
    path: str,
    *,
    sha: str,
    message: str,
    branch: Optional[str] = None,
) -> dict | list | str:
    """Delete a file from a repository."""
    body: dict = {"sha": sha, "message": message}
    if branch is not None: body["branch"] = branch
    return await _request("DELETE", f"/repos/{owner}/{repo}/contents/{path}", json_body=body)


# ── Branches ──

@_tool
async def gitcode_list_branches(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
    sort: Optional[str] = None,
) -> dict | list | str:
    """List all branches of a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    if sort is not None: params["sort"] = sort
    return await _request("GET", f"/repos/{owner}/{repo}/branches", params=params)


@_tool
async def gitcode_get_branch(owner: str, repo: str, branch: str) -> dict | list | str:
    """Get a single branch."""
    return await _request("GET", f"/repos/{owner}/{repo}/branches/{branch}")


@_tool
async def gitcode_create_branch(
    owner: str, repo: str, *, refs: str, branch_name: str
) -> dict | list | str:
    """Create a new branch."""
    return await _request(
        "POST",
        f"/repos/{owner}/{repo}/branches",
        json_body={"refs": refs, "branch_name": branch_name},
    )


@_tool
async def gitcode_delete_branch(owner: str, repo: str, name: str) -> dict | list | str:
    """Delete a branch."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/branches/{name}")


@_tool
async def gitcode_list_protected_branches(owner: str, repo: str) -> dict | list | str:
    """List protected branches of a repository."""
    return await _request("GET", f"/repos/{owner}/{repo}/protect_branches")


@_tool
async def gitcode_create_branch_protection(
    owner: str,
    repo: str,
    *,
    wildcard: str,
    pusher: Optional[str] = None,
    merger: Optional[str] = None,
) -> dict | list | str:
    """Create a new branch protection rule."""
    body: dict = {"wildcard": wildcard}
    if pusher is not None: body["pusher"] = pusher
    if merger is not None: body["merger"] = merger
    return await _request("PUT", f"/repos/{owner}/{repo}/branches/setting/new", json_body=body)


@_tool
async def gitcode_update_branch_protection(
    owner: str,
    repo: str,
    wildcard: str,
    *,
    pusher: Optional[str] = None,
    merger: Optional[str] = None,
) -> dict | list | str:
    """Update a branch protection rule."""
    body = {}
    if pusher is not None: body["pusher"] = pusher
    if merger is not None: body["merger"] = merger
    return await _request(
        "PUT", f"/repos/{owner}/{repo}/branches/{wildcard}/setting", json_body=body
    )


@_tool
async def gitcode_delete_branch_protection(
    owner: str, repo: str, wildcard: str
) -> dict | list | str:
    """Delete a branch protection rule."""
    return await _request(
        "DELETE", f"/repos/{owner}/{repo}/branches/{wildcard}/setting"
    )


# ── Commits ──

@_tool
async def gitcode_list_commits(
    owner: str,
    repo: str,
    *,
    sha: Optional[str] = None,
    path: Optional[str] = None,
    author: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List commits for a repository."""
    params = {}
    if sha is not None: params["sha"] = sha
    if path is not None: params["path"] = path
    if author is not None: params["author"] = author
    if since is not None: params["since"] = since
    if until is not None: params["until"] = until
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/commits", params=params)


@_tool
async def gitcode_get_commit(owner: str, repo: str, sha: str) -> dict | list | str:
    """Get a single commit."""
    return await _request("GET", f"/repos/{owner}/{repo}/commits/{sha}")


@_tool
async def gitcode_compare_commits(
    owner: str,
    repo: str,
    base: str,
    head: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """Compare two commits or branches."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request(
        "GET", f"/repos/{owner}/{repo}/compare/{base}...{head}", params=params
    )


@_tool
async def gitcode_get_commit_diff(owner: str, repo: str, sha: str) -> dict | list | str:
    """Get the diff for a commit."""
    return await _request("GET", f"/repos/{owner}/{repo}/commit/{sha}/diff")


@_tool
async def gitcode_get_commit_patch(owner: str, repo: str, sha: str) -> dict | list | str:
    """Get the patch for a commit."""
    return await _request("GET", f"/repos/{owner}/{repo}/commit/{sha}/patch")


@_tool
async def gitcode_list_commit_comments(
    owner: str,
    repo: str,
    ref: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List comments on a commit."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request(
        "GET", f"/repos/{owner}/{repo}/commits/{ref}/comments", params=params
    )


@_tool
async def gitcode_create_commit_comment(
    owner: str, repo: str, sha: str, *, body: str
) -> dict | list | str:
    """Create a comment on a commit."""
    return await _request(
        "POST", f"/repos/{owner}/{repo}/commits/{sha}/comments", json_body={"body": body}
    )


@_tool
async def gitcode_list_repo_comments(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List all commit comments for a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/comments", params=params)


@_tool
async def gitcode_get_comment(owner: str, repo: str, id: int) -> dict | list | str:
    """Get a single commit comment."""
    return await _request("GET", f"/repos/{owner}/{repo}/comments/{id}")


@_tool
async def gitcode_update_comment(
    owner: str, repo: str, id: int, *, body: str
) -> dict | list | str:
    """Update a commit comment."""
    return await _request(
        "PATCH", f"/repos/{owner}/{repo}/comments/{id}", json_body={"body": body}
    )


@_tool
async def gitcode_delete_comment(owner: str, repo: str, id: int) -> dict | list | str:
    """Delete a commit comment."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/comments/{id}")


# ── Issues ──

@_tool
async def gitcode_list_issues(
    owner: str,
    repo: str,
    *,
    state: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    labels: Optional[str] = None,
    milestone: Optional[str] = None,
    creator: Optional[str] = None,
    assignee: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List issues for a repository."""
    params = {}
    if state is not None: params["state"] = state
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if labels is not None: params["labels"] = labels
    if milestone is not None: params["milestone"] = milestone
    if creator is not None: params["creator"] = creator
    if assignee is not None: params["assignee"] = assignee
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/issues", params=params)


@_tool
async def gitcode_get_issue(owner: str, repo: str, number: int) -> dict | list | str:
    """Get a single issue."""
    return await _request("GET", f"/repos/{owner}/{repo}/issues/{number}")


@_tool
async def gitcode_create_issue(
    owner: str,
    *,
    repo: str,
    title: str,
    body: Optional[str] = None,
    assignee: Optional[str] = None,
    milestone: Optional[int] = None,
    labels: Optional[str] = None,
) -> dict | list | str:
    """Create a new issue."""
    json_body: dict = {"repo": repo, "title": title}
    if body is not None: json_body["body"] = body
    if assignee is not None: json_body["assignee"] = assignee
    if milestone is not None: json_body["milestone"] = milestone
    if labels is not None: json_body["labels"] = labels
    return await _request("POST", f"/repos/{owner}/issues", json_body=json_body)


@_tool
async def gitcode_update_issue(
    owner: str,
    repo: str,
    number: int,
    *,
    title: Optional[str] = None,
    body: Optional[str] = None,
    state_event: Optional[str] = None,
    assignee: Optional[str] = None,
    milestone: Optional[int] = None,
    labels: Optional[str] = None,
) -> dict | list | str:
    """Update an issue. Use state_event='close' or 'reopen' to change state."""
    json_body: dict = {"repo": repo}
    if title is not None: json_body["title"] = title
    if body is not None: json_body["body"] = body
    if state_event is not None: json_body["state_event"] = state_event
    if assignee is not None: json_body["assignee"] = assignee
    if milestone is not None: json_body["milestone"] = milestone
    if labels is not None: json_body["labels"] = labels
    return await _request("PATCH", f"/repos/{owner}/issues/{number}", json_body=json_body)


@_tool
async def gitcode_list_issue_comments(
    owner: str,
    repo: str,
    number: int,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
    since: Optional[str] = None,
    order: Optional[str] = None,
) -> dict | list | str:
    """List comments on an issue."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    if since is not None: params["since"] = since
    if order is not None: params["order"] = order
    return await _request(
        "GET", f"/repos/{owner}/{repo}/issues/{number}/comments", params=params
    )


@_tool
async def gitcode_create_issue_comment(
    owner: str, repo: str, number: int, *, body: str
) -> dict | list | str:
    """Create a comment on an issue."""
    return await _request(
        "POST",
        f"/repos/{owner}/{repo}/issues/{number}/comments",
        json_body={"body": body},
    )


@_tool
async def gitcode_update_issue_comment(
    owner: str, repo: str, id: int, *, body: str
) -> dict | list | str:
    """Update an issue comment."""
    return await _request(
        "PATCH",
        f"/repos/{owner}/{repo}/issues/comments/{id}",
        json_body={"body": body},
    )


@_tool
async def gitcode_delete_issue_comment(owner: str, repo: str, id: int) -> dict | list | str:
    """Delete an issue comment."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/issues/comments/{id}")


@_tool
async def gitcode_list_all_issue_comments(
    owner: str,
    repo: str,
    *,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    since: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List all issue comments for a repository."""
    params = {}
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if since is not None: params["since"] = since
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/issues/comments", params=params)


@_tool
async def gitcode_get_issue_comment(owner: str, repo: str, id: int) -> dict | list | str:
    """Get a single issue comment."""
    return await _request("GET", f"/repos/{owner}/{repo}/issues/comments/{id}")


@_tool
async def gitcode_add_issue_labels(
    owner: str, repo: str, number: int, *, labels: list[str]
) -> dict | list | str:
    """Add labels to an issue."""
    return await _request(
        "POST", f"/repos/{owner}/{repo}/issues/{number}/labels", json_body=labels
    )


@_tool
async def gitcode_remove_issue_label(
    owner: str, repo: str, number: int, name: str
) -> dict | list | str:
    """Remove a label from an issue."""
    return await _request(
        "DELETE", f"/repos/{owner}/{repo}/issues/{number}/labels/{name}"
    )


@_tool
async def gitcode_remove_all_issue_labels(
    owner: str, repo: str, number: int
) -> dict | list | str:
    """Remove all labels from an issue."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/issues/{number}/labels")


@_tool
async def gitcode_replace_issue_labels(
    owner: str, repo: str, number: int, *, labels: list[str]
) -> dict | list | str:
    """Replace all labels on an issue."""
    return await _request(
        "PUT", f"/repos/{owner}/{repo}/issues/{number}/labels", json_body=labels
    )


@_tool
async def gitcode_get_issue_related_branches(
    owner: str, repo: str, number: int
) -> dict | list | str:
    """Get branches related to an issue."""
    return await _request(
        "GET", f"/repos/{owner}/{repo}/issues/{number}/related_branches"
    )


@_tool
async def gitcode_list_user_issues(
    *,
    filter: Optional[str] = None,
    state: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List issues assigned to the authenticated user."""
    params = {}
    if filter is not None: params["filter"] = filter
    if state is not None: params["state"] = state
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", "/user/issues", params=params)


@_tool
async def gitcode_list_org_issues(
    org: str,
    *,
    state: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    labels: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List issues for an organization."""
    params = {}
    if state is not None: params["state"] = state
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if labels is not None: params["labels"] = labels
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/orgs/{org}/issues", params=params)


@_tool
async def gitcode_search_issues(
    q: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
    repo: Optional[str] = None,
    language: Optional[str] = None,
    label: Optional[str] = None,
    state: Optional[str] = None,
    author: Optional[str] = None,
    assignee: Optional[str] = None,
    sort: Optional[str] = None,
    order: Optional[str] = None,
) -> dict | list | str:
    """Search issues."""
    params: dict = {"q": q}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    if repo is not None: params["repo"] = repo
    if language is not None: params["language"] = language
    if label is not None: params["label"] = label
    if state is not None: params["state"] = state
    if author is not None: params["author"] = author
    if assignee is not None: params["assignee"] = assignee
    if sort is not None: params["sort"] = sort
    if order is not None: params["order"] = order
    return await _request("GET", "/search/issues", params=params)


# ── Pull Requests ──

@_tool
async def gitcode_list_pulls(
    owner: str,
    repo: str,
    *,
    state: Optional[str] = None,
    head: Optional[str] = None,
    base: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    milestone: Optional[int] = None,
    labels: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List pull requests for a repository."""
    params = {}
    if state is not None: params["state"] = state
    if head is not None: params["head"] = head
    if base is not None: params["base"] = base
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if milestone is not None: params["milestone"] = milestone
    if labels is not None: params["labels"] = labels
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/pulls", params=params)


@_tool
async def gitcode_get_pull(owner: str, repo: str, number: int) -> dict | list | str:
    """Get a single pull request."""
    return await _request("GET", f"/repos/{owner}/{repo}/pulls/{number}")


@_tool
async def gitcode_create_pull(
    owner: str,
    repo: str,
    *,
    title: str,
    head: str,
    base: str,
    body: Optional[str] = None,
    milestone: Optional[int] = None,
    labels: Optional[str] = None,
    assignees: Optional[list[str]] = None,
) -> dict | list | str:
    """Create a pull request."""
    json_body: dict = {"title": title, "head": head, "base": base}
    if body is not None: json_body["body"] = body
    if milestone is not None: json_body["milestone"] = milestone
    if labels is not None: json_body["labels"] = labels
    if assignees is not None: json_body["assignees"] = assignees
    return await _request("POST", f"/repos/{owner}/{repo}/pulls", json_body=json_body)


@_tool
async def gitcode_update_pull(
    owner: str,
    repo: str,
    number: int,
    *,
    title: Optional[str] = None,
    body: Optional[str] = None,
    state: Optional[str] = None,
    milestone: Optional[int] = None,
    labels: Optional[str] = None,
    assignees: Optional[list[str]] = None,
) -> dict | list | str:
    """Update a pull request."""
    json_body = {}
    if title is not None: json_body["title"] = title
    if body is not None: json_body["body"] = body
    if state is not None: json_body["state"] = state
    if milestone is not None: json_body["milestone"] = milestone
    if labels is not None: json_body["labels"] = labels
    if assignees is not None: json_body["assignees"] = assignees
    return await _request(
        "PATCH", f"/repos/{owner}/{repo}/pulls/{number}", json_body=json_body
    )


@_tool
async def gitcode_list_pull_files(owner: str, repo: str, number: int) -> dict | list | str:
    """List files changed in a pull request."""
    return await _request("GET", f"/repos/{owner}/{repo}/pulls/{number}/files")


@_tool
async def gitcode_list_pull_commits(
    owner: str,
    repo: str,
    number: int,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List commits on a pull request."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request(
        "GET", f"/repos/{owner}/{repo}/pulls/{number}/commits", params=params
    )


@_tool
async def gitcode_list_pull_comments(
    owner: str,
    repo: str,
    number: int,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
    since: Optional[str] = None,
    direction: Optional[str] = None,
) -> dict | list | str:
    """List review comments on a pull request."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    if since is not None: params["since"] = since
    if direction is not None: params["direction"] = direction
    return await _request(
        "GET", f"/repos/{owner}/{repo}/pulls/{number}/comments", params=params
    )


@_tool
async def gitcode_create_pull_comment(
    owner: str,
    repo: str,
    number: int,
    *,
    body: str,
    path: Optional[str] = None,
    position: Optional[int] = None,
) -> dict | list | str:
    """Create a review comment on a pull request."""
    json_body: dict = {"body": body}
    if path is not None: json_body["path"] = path
    if position is not None: json_body["position"] = position
    return await _request(
        "POST", f"/repos/{owner}/{repo}/pulls/{number}/comments", json_body=json_body
    )


@_tool
async def gitcode_get_pull_comment(owner: str, repo: str, id: int) -> dict | list | str:
    """Get a single review comment on a pull request."""
    return await _request("GET", f"/repos/{owner}/{repo}/pulls/comments/{id}")


@_tool
async def gitcode_update_pull_comment(
    owner: str, repo: str, id: int, *, body: str
) -> dict | list | str:
    """Update a review comment on a pull request."""
    return await _request(
        "PATCH",
        f"/repos/{owner}/{repo}/pulls/comments/{id}",
        json_body={"body": body},
    )


@_tool
async def gitcode_delete_pull_comment(owner: str, repo: str, id: int) -> dict | list | str:
    """Delete a review comment on a pull request."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/pulls/comments/{id}")


@_tool
async def gitcode_check_pull_merged(owner: str, repo: str, number: int) -> dict | list | str:
    """Check if a pull request has been merged."""
    return await _request("GET", f"/repos/{owner}/{repo}/pulls/{number}/merge")


@_tool
async def gitcode_merge_pull(
    owner: str,
    repo: str,
    number: int,
    *,
    merge_method: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
) -> dict | list | str:
    """Merge a pull request."""
    body = {}
    if merge_method is not None: body["merge_method"] = merge_method
    if title is not None: body["title"] = title
    if description is not None: body["description"] = description
    return await _request(
        "PUT", f"/repos/{owner}/{repo}/pulls/{number}/merge", json_body=body
    )


@_tool
async def gitcode_list_pull_labels(owner: str, repo: str, number: int) -> dict | list | str:
    """List labels on a pull request."""
    return await _request("GET", f"/repos/{owner}/{repo}/pulls/{number}/labels")


@_tool
async def gitcode_add_pull_labels(
    owner: str, repo: str, number: int, *, labels: list[str]
) -> dict | list | str:
    """Add labels to a pull request."""
    return await _request(
        "POST", f"/repos/{owner}/{repo}/pulls/{number}/labels", json_body=labels
    )


@_tool
async def gitcode_replace_pull_labels(
    owner: str, repo: str, number: int, *, labels: list[str]
) -> dict | list | str:
    """Replace all labels on a pull request."""
    return await _request(
        "PUT", f"/repos/{owner}/{repo}/pulls/{number}/labels", json_body=labels
    )


@_tool
async def gitcode_remove_pull_label(
    owner: str, repo: str, number: int, name: str
) -> dict | list | str:
    """Remove a label from a pull request."""
    return await _request(
        "DELETE", f"/repos/{owner}/{repo}/pulls/{number}/labels/{name}"
    )


@_tool
async def gitcode_assign_pull_reviewers(
    owner: str, repo: str, number: int, *, assignees: list[str]
) -> dict | list | str:
    """Assign reviewers to a pull request."""
    return await _request(
        "POST",
        f"/repos/{owner}/{repo}/pulls/{number}/assignees",
        json_body={"assignees": assignees},
    )


@_tool
async def gitcode_reset_pull_review(
    owner: str,
    repo: str,
    number: int,
    *,
    assignees: Optional[list[str]] = None,
    reset_all: Optional[bool] = None,
) -> dict | list | str:
    """Reset review status on a pull request."""
    body = {}
    if assignees is not None: body["assignees"] = assignees
    if reset_all is not None: body["reset_all"] = reset_all
    return await _request(
        "PATCH", f"/repos/{owner}/{repo}/pulls/{number}/assignees", json_body=body
    )


@_tool
async def gitcode_remove_pull_reviewers(
    owner: str, repo: str, number: int, *, assignees: list[str]
) -> dict | list | str:
    """Remove reviewers from a pull request."""
    return await _request(
        "DELETE",
        f"/repos/{owner}/{repo}/pulls/{number}/assignees",
        json_body={"assignees": assignees},
    )


@_tool
async def gitcode_assign_pull_testers(
    owner: str, repo: str, number: int, *, assignees: list[str]
) -> dict | list | str:
    """Assign testers to a pull request."""
    return await _request(
        "POST",
        f"/repos/{owner}/{repo}/pulls/{number}/testers",
        json_body={"assignees": assignees},
    )


@_tool
async def gitcode_reset_pull_test(owner: str, repo: str, number: int) -> dict | list | str:
    """Reset test status on a pull request."""
    return await _request("PATCH", f"/repos/{owner}/{repo}/pulls/{number}/testers")


@_tool
async def gitcode_remove_pull_testers(owner: str, repo: str, number: int) -> dict | list | str:
    """Remove testers from a pull request."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/pulls/{number}/testers")


@_tool
async def gitcode_submit_pull_review(
    owner: str,
    repo: str,
    number: int,
    *,
    body: Optional[str] = None,
    event: Optional[str] = None,
) -> dict | list | str:
    """Submit a review on a pull request."""
    json_body = {}
    if body is not None: json_body["body"] = body
    if event is not None: json_body["event"] = event
    return await _request(
        "POST", f"/repos/{owner}/{repo}/pulls/{number}/review", json_body=json_body
    )


@_tool
async def gitcode_submit_pull_test(
    owner: str,
    repo: str,
    number: int,
    *,
    body: Optional[str] = None,
    event: Optional[str] = None,
) -> dict | list | str:
    """Submit a test result on a pull request."""
    json_body = {}
    if body is not None: json_body["body"] = body
    if event is not None: json_body["event"] = event
    return await _request(
        "POST", f"/repos/{owner}/{repo}/pulls/{number}/test", json_body=json_body
    )


@_tool
async def gitcode_link_pull_issues(
    owner: str, repo: str, number: int, *, issues: list[int]
) -> dict | list | str:
    """Link issues to a pull request."""
    return await _request(
        "POST",
        f"/repos/{owner}/{repo}/pulls/{number}/issues",
        json_body={"issues": issues},
    )


@_tool
async def gitcode_unlink_pull_issues(
    owner: str, repo: str, number: int, *, issues: list[int]
) -> dict | list | str:
    """Unlink issues from a pull request."""
    return await _request(
        "DELETE",
        f"/repos/{owner}/{repo}/pulls/{number}/issues",
        json_body={"issues": issues},
    )


@_tool
async def gitcode_list_pull_issues(
    owner: str,
    repo: str,
    number: int,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List issues linked to a pull request."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request(
        "GET", f"/repos/{owner}/{repo}/pulls/{number}/issues", params=params
    )


@_tool
async def gitcode_get_pull_settings(owner: str, repo: str) -> dict | list | str:
    """Get pull request settings for a repository."""
    return await _request("GET", f"/repos/{owner}/{repo}/pull_request_settings")


@_tool
async def gitcode_list_user_pulls(
    *,
    state: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List pull requests for the authenticated user."""
    params = {}
    if state is not None: params["state"] = state
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", "/user/pulls", params=params)


@_tool
async def gitcode_list_org_pulls(
    org: str,
    *,
    state: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List pull requests for an organization."""
    params = {}
    if state is not None: params["state"] = state
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/org/{org}/pull_requests", params=params)


# ── Labels ──

@_tool
async def gitcode_list_labels(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List labels for a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/labels", params=params)


@_tool
async def gitcode_create_label(
    owner: str, repo: str, *, name: str, color: str
) -> dict | list | str:
    """Create a label in a repository."""
    return await _request(
        "POST", f"/repos/{owner}/{repo}/labels", json_body={"name": name, "color": color}
    )


@_tool
async def gitcode_update_label(
    owner: str,
    repo: str,
    original_name: str,
    *,
    name: Optional[str] = None,
    color: Optional[str] = None,
) -> dict | list | str:
    """Update a label in a repository."""
    body = {}
    if name is not None: body["name"] = name
    if color is not None: body["color"] = color
    return await _request(
        "PATCH", f"/repos/{owner}/{repo}/labels/{original_name}", json_body=body
    )


@_tool
async def gitcode_delete_label(owner: str, repo: str, name: str) -> dict | list | str:
    """Delete a label from a repository."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/labels/{name}")


# ── Milestones ──

@_tool
async def gitcode_list_milestones(
    owner: str,
    repo: str,
    *,
    state: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List milestones for a repository."""
    params = {}
    if state is not None: params["state"] = state
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/milestones", params=params)


@_tool
async def gitcode_get_milestone(owner: str, repo: str, number: int) -> dict | list | str:
    """Get a single milestone."""
    return await _request("GET", f"/repos/{owner}/{repo}/milestones/{number}")


@_tool
async def gitcode_create_milestone(
    owner: str,
    repo: str,
    *,
    title: str,
    description: Optional[str] = None,
    due_on: Optional[str] = None,
    state: Optional[str] = None,
) -> dict | list | str:
    """Create a milestone in a repository."""
    body: dict = {"title": title}
    if description is not None: body["description"] = description
    if due_on is not None: body["due_on"] = due_on
    if state is not None: body["state"] = state
    return await _request("POST", f"/repos/{owner}/{repo}/milestones", json_body=body)


@_tool
async def gitcode_update_milestone(
    owner: str,
    repo: str,
    number: int,
    *,
    title: Optional[str] = None,
    description: Optional[str] = None,
    due_on: Optional[str] = None,
    state: Optional[str] = None,
) -> dict | list | str:
    """Update a milestone."""
    body = {}
    if title is not None: body["title"] = title
    if description is not None: body["description"] = description
    if due_on is not None: body["due_on"] = due_on
    if state is not None: body["state"] = state
    return await _request(
        "PATCH", f"/repos/{owner}/{repo}/milestones/{number}", json_body=body
    )


@_tool
async def gitcode_delete_milestone(owner: str, repo: str, number: int) -> dict | list | str:
    """Delete a milestone."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/milestones/{number}")


# ── Tags ──

@_tool
async def gitcode_list_tags(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List tags for a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/tags", params=params)


@_tool
async def gitcode_create_tag(
    owner: str,
    repo: str,
    *,
    tag_name: str,
    refs: str,
    tag_message: Optional[str] = None,
) -> dict | list | str:
    """Create a tag in a repository."""
    body: dict = {"tag_name": tag_name, "refs": refs}
    if tag_message is not None: body["tag_message"] = tag_message
    return await _request("POST", f"/repos/{owner}/{repo}/tags", json_body=body)


@_tool
async def gitcode_delete_tag(owner: str, repo: str, tag_name: str) -> dict | list | str:
    """Delete a tag from a repository."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/tags/{tag_name}")


@_tool
async def gitcode_list_protected_tags(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List protected tags for a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/protected_tags", params=params)


@_tool
async def gitcode_get_protected_tag(
    owner: str, repo: str, tag_name: str
) -> dict | list | str:
    """Get a protected tag."""
    return await _request("GET", f"/repos/{owner}/{repo}/protected_tags/{tag_name}")


@_tool
async def gitcode_create_protected_tag(
    owner: str, repo: str, *, tag_name: str
) -> dict | list | str:
    """Create a protected tag."""
    return await _request(
        "POST", f"/repos/{owner}/{repo}/protected_tags", json_body={"tag_name": tag_name}
    )


@_tool
async def gitcode_update_protected_tag(
    owner: str,
    repo: str,
    *,
    tag_name: str,
    create_access_level: Optional[int] = None,
    allowed_users: Optional[list[str]] = None,
) -> dict | list | str:
    """Update a protected tag."""
    body: dict = {"tag_name": tag_name}
    if create_access_level is not None: body["create_access_level"] = create_access_level
    if allowed_users is not None: body["allowed_users"] = allowed_users
    return await _request("PUT", f"/repos/{owner}/{repo}/protected_tags", json_body=body)


@_tool
async def gitcode_delete_protected_tag(
    owner: str, repo: str, tag_name: str
) -> dict | list | str:
    """Delete a protected tag."""
    return await _request(
        "DELETE", f"/repos/{owner}/{repo}/protected_tags/{tag_name}"
    )


# ── Releases ──

@_tool
async def gitcode_list_releases(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List releases for a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/releases", params=params)


@_tool
async def gitcode_get_latest_release(owner: str, repo: str) -> dict | list | str:
    """Get the latest release for a repository."""
    return await _request("GET", f"/repos/{owner}/{repo}/releases/latest")


@_tool
async def gitcode_get_release(owner: str, repo: str, tag: str) -> dict | list | str:
    """Get a release by tag name."""
    return await _request("GET", f"/repos/{owner}/{repo}/releases/{tag}")


@_tool
async def gitcode_get_release_by_tag(owner: str, repo: str, tag: str) -> dict | list | str:
    """Get a release by tag (explicit tag lookup)."""
    return await _request("GET", f"/repos/{owner}/{repo}/releases/tags/{tag}")


@_tool
async def gitcode_create_release(
    owner: str,
    repo: str,
    *,
    tag_name: str,
    name: Optional[str] = None,
    body: Optional[str] = None,
    prerelease: Optional[bool] = None,
    target_commitish: Optional[str] = None,
) -> dict | list | str:
    """Create a release."""
    json_body: dict = {"tag_name": tag_name}
    if name is not None: json_body["name"] = name
    if body is not None: json_body["body"] = body
    if prerelease is not None: json_body["prerelease"] = prerelease
    if target_commitish is not None: json_body["target_commitish"] = target_commitish
    return await _request("POST", f"/repos/{owner}/{repo}/releases", json_body=json_body)


@_tool
async def gitcode_update_release(
    owner: str,
    repo: str,
    tag: str,
    *,
    tag_name: Optional[str] = None,
    name: Optional[str] = None,
    body: Optional[str] = None,
    prerelease: Optional[bool] = None,
) -> dict | list | str:
    """Update a release."""
    json_body = {}
    if tag_name is not None: json_body["tag_name"] = tag_name
    if name is not None: json_body["name"] = name
    if body is not None: json_body["body"] = body
    if prerelease is not None: json_body["prerelease"] = prerelease
    return await _request(
        "PATCH", f"/repos/{owner}/{repo}/releases/{tag}", json_body=json_body
    )


# ── Webhooks ──

@_tool
async def gitcode_list_webhooks(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List webhooks for a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/hooks", params=params)


@_tool
async def gitcode_get_webhook(owner: str, repo: str, id: int) -> dict | list | str:
    """Get a single webhook."""
    return await _request("GET", f"/repos/{owner}/{repo}/hooks/{id}")


@_tool
async def gitcode_create_webhook(
    owner: str,
    repo: str,
    *,
    url: str,
    content_type: Optional[str] = None,
    secret: Optional[str] = None,
    events: Optional[list[str]] = None,
    active: Optional[bool] = None,
) -> dict | list | str:
    """Create a webhook for a repository."""
    body: dict = {"url": url}
    if content_type is not None: body["content_type"] = content_type
    if secret is not None: body["secret"] = secret
    if events is not None: body["events"] = events
    if active is not None: body["active"] = active
    return await _request("POST", f"/repos/{owner}/{repo}/hooks", json_body=body)


@_tool
async def gitcode_update_webhook(
    owner: str,
    repo: str,
    id: int,
    *,
    url: Optional[str] = None,
    content_type: Optional[str] = None,
    secret: Optional[str] = None,
    events: Optional[list[str]] = None,
    active: Optional[bool] = None,
) -> dict | list | str:
    """Update a webhook."""
    body = {}
    if url is not None: body["url"] = url
    if content_type is not None: body["content_type"] = content_type
    if secret is not None: body["secret"] = secret
    if events is not None: body["events"] = events
    if active is not None: body["active"] = active
    return await _request("PATCH", f"/repos/{owner}/{repo}/hooks/{id}", json_body=body)


@_tool
async def gitcode_delete_webhook(owner: str, repo: str, id: int) -> dict | list | str:
    """Delete a webhook."""
    return await _request("DELETE", f"/repos/{owner}/{repo}/hooks/{id}")


@_tool
async def gitcode_test_webhook(owner: str, repo: str, id: int) -> dict | list | str:
    """Trigger a test delivery for a webhook."""
    return await _request("POST", f"/repos/{owner}/{repo}/hooks/{id}/tests")


# ── Members & Collaborators ──

@_tool
async def gitcode_list_collaborators(
    owner: str,
    repo: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List collaborators for a repository."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/repos/{owner}/{repo}/collaborators", params=params)


@_tool
async def gitcode_check_collaborator(
    owner: str, repo: str, username: str
) -> dict | list | str:
    """Check if a user is a collaborator."""
    return await _request(
        "GET", f"/repos/{owner}/{repo}/collaborators/{username}"
    )


@_tool
async def gitcode_get_collaborator_permission(
    owner: str, repo: str, username: str
) -> dict | list | str:
    """Get a collaborator's permission level."""
    return await _request(
        "GET", f"/repos/{owner}/{repo}/collaborators/{username}/permission"
    )


@_tool
async def gitcode_add_collaborator(
    owner: str, repo: str, username: str, *, permission: Optional[str] = None
) -> dict | list | str:
    """Add a collaborator to a repository."""
    body = {}
    if permission is not None: body["permission"] = permission
    return await _request(
        "PUT", f"/repos/{owner}/{repo}/collaborators/{username}", json_body=body
    )


@_tool
async def gitcode_remove_collaborator(
    owner: str, repo: str, username: str
) -> dict | list | str:
    """Remove a collaborator from a repository."""
    return await _request(
        "DELETE", f"/repos/{owner}/{repo}/collaborators/{username}"
    )


@_tool
async def gitcode_list_org_members(
    org: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List members of an organization."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/orgs/{org}/members", params=params)


@_tool
async def gitcode_get_org_member(org: str, username: str) -> dict | list | str:
    """Get a member of an organization."""
    return await _request("GET", f"/orgs/{org}/members/{username}")


@_tool
async def gitcode_invite_org_member(
    org: str, username: str, *, role: Optional[str] = None
) -> dict | list | str:
    """Invite a user to an organization."""
    body = {}
    if role is not None: body["role"] = role
    return await _request(
        "POST", f"/orgs/{org}/memberships/{username}", json_body=body
    )


@_tool
async def gitcode_remove_org_member(org: str, username: str) -> dict | list | str:
    """Remove a member from an organization."""
    return await _request("DELETE", f"/orgs/{org}/memberships/{username}")


# ── Organizations ──

@_tool
async def gitcode_get_org(org: str) -> dict | list | str:
    """Get an organization."""
    return await _request("GET", f"/orgs/{org}")


@_tool
async def gitcode_update_org(
    org: str,
    *,
    description: Optional[str] = None,
    name: Optional[str] = None,
) -> dict | list | str:
    """Update an organization."""
    body = {}
    if description is not None: body["description"] = description
    if name is not None: body["name"] = name
    return await _request("PATCH", f"/orgs/{org}", json_body=body)


@_tool
async def gitcode_list_org_repos(
    org: str,
    *,
    type: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List repositories for an organization."""
    params = {}
    if type is not None: params["type"] = type
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/orgs/{org}/repos", params=params)


@_tool
async def gitcode_create_org_repo(
    org: str,
    *,
    name: str,
    description: Optional[str] = None,
    private: Optional[bool] = None,
    has_issues: Optional[bool] = None,
    has_wiki: Optional[bool] = None,
) -> dict | list | str:
    """Create a repository for an organization."""
    body: dict = {"name": name}
    if description is not None: body["description"] = description
    if private is not None: body["private"] = private
    if has_issues is not None: body["has_issues"] = has_issues
    if has_wiki is not None: body["has_wiki"] = has_wiki
    return await _request("POST", f"/orgs/{org}/repos", json_body=body)


@_tool
async def gitcode_list_user_orgs(
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List organizations for the authenticated user."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", "/users/orgs", params=params)


@_tool
async def gitcode_list_user_orgs_by_name(
    username: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List organizations for a user."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/users/{username}/orgs", params=params)


# ── Users ──

@_tool
async def gitcode_get_user() -> dict | list | str:
    """Get the authenticated user."""
    return await _request("GET", "/user")


@_tool
async def gitcode_update_user(
    *,
    name: Optional[str] = None,
    blog: Optional[str] = None,
    email: Optional[str] = None,
    bio: Optional[str] = None,
) -> dict | list | str:
    """Update the authenticated user's profile."""
    body = {}
    if name is not None: body["name"] = name
    if blog is not None: body["blog"] = blog
    if email is not None: body["email"] = email
    if bio is not None: body["bio"] = bio
    return await _request("PATCH", "/user", json_body=body)


@_tool
async def gitcode_get_user_by_name(username: str) -> dict | list | str:
    """Get a user by username."""
    return await _request("GET", f"/users/{username}")


@_tool
async def gitcode_list_user_repos_by_name(
    username: str,
    *,
    type: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List repositories for a user."""
    params = {}
    if type is not None: params["type"] = type
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/users/{username}/repos", params=params)


@_tool
async def gitcode_list_user_events(
    username: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List events performed by a user."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/users/{username}/events", params=params)


@_tool
async def gitcode_list_my_repos(
    *,
    visibility: Optional[str] = None,
    affiliation: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List repositories for the authenticated user."""
    params = {}
    if visibility is not None: params["visibility"] = visibility
    if affiliation is not None: params["affiliation"] = affiliation
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", "/user/repos", params=params)


@_tool
async def gitcode_list_my_starred(
    *,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List repositories starred by the authenticated user."""
    params = {}
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", "/user/starred", params=params)


@_tool
async def gitcode_list_my_subscriptions(
    *,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List repositories watched by the authenticated user."""
    params = {}
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", "/user/subscriptions", params=params)


@_tool
async def gitcode_list_ssh_keys(
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List SSH public keys for the authenticated user."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", "/user/keys", params=params)


@_tool
async def gitcode_get_ssh_key(id: int) -> dict | list | str:
    """Get a single SSH key."""
    return await _request("GET", f"/user/keys/{id}")


@_tool
async def gitcode_add_ssh_key(*, key: str, title: str) -> dict | list | str:
    """Add an SSH public key for the authenticated user."""
    return await _request("POST", "/user/keys", json_body={"key": key, "title": title})


@_tool
async def gitcode_delete_ssh_key(id: int) -> dict | list | str:
    """Delete an SSH key for the authenticated user."""
    return await _request("DELETE", f"/user/keys/{id}")


@_tool
async def gitcode_list_emails() -> dict | list | str:
    """List email addresses for the authenticated user."""
    return await _request("GET", "/user/emails")


# ── Search ──

@_tool
async def gitcode_search_users(
    q: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """Search users."""
    params: dict = {"q": q}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", "/search/users", params=params)


# ── Enterprise ──

@_tool
async def gitcode_list_enterprise_members(
    enterprise: str,
    *,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List members of an enterprise."""
    params = {}
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/enterprises/{enterprise}/members", params=params)


@_tool
async def gitcode_list_enterprise_issues(
    enterprise: str,
    *,
    state: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    labels: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
    milestone: Optional[str] = None,
    since: Optional[str] = None,
) -> dict | list | str:
    """List issues for an enterprise."""
    params = {}
    if state is not None: params["state"] = state
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if labels is not None: params["labels"] = labels
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    if milestone is not None: params["milestone"] = milestone
    if since is not None: params["since"] = since
    return await _request("GET", f"/enterprises/{enterprise}/issues", params=params)


@_tool
async def gitcode_get_enterprise_issue(enterprise: str, number: int) -> dict | list | str:
    """Get a single issue for an enterprise."""
    return await _request("GET", f"/enterprises/{enterprise}/issues/{number}")


@_tool
async def gitcode_list_enterprise_pulls(
    enterprise: str,
    *,
    state: Optional[str] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
) -> dict | list | str:
    """List pull requests for an enterprise."""
    params = {}
    if state is not None: params["state"] = state
    if sort is not None: params["sort"] = sort
    if direction is not None: params["direction"] = direction
    if page is not None: params["page"] = page
    if per_page is not None: params["per_page"] = per_page
    return await _request("GET", f"/enterprises/{enterprise}/pull_requests", params=params)


TOOLSET_CORE = {
    "gitcode_get_user",
    "gitcode_get_repo",
    "gitcode_search_repos",
    "gitcode_get_contents",
    "gitcode_get_raw_file",
    "gitcode_create_file",
    "gitcode_update_file",
    "gitcode_list_branches",
    "gitcode_get_branch",
    "gitcode_list_commits",
    "gitcode_get_commit",
    "gitcode_list_issues",
    "gitcode_get_issue",
    "gitcode_create_issue",
    "gitcode_create_issue_comment",
    "gitcode_list_pulls",
    "gitcode_get_pull",
    "gitcode_create_pull",
    "gitcode_merge_pull",
    "gitcode_create_pull_comment",
    "gitcode_list_pull_files",
    "gitcode_search_issues",
}

TOOLSET_EXTENDED = TOOLSET_CORE | {
    # Repos
    "gitcode_delete_repo",
    "gitcode_update_repo",
    "gitcode_get_readme",
    "gitcode_list_languages",
    "gitcode_list_contributors",
    "gitcode_list_stargazers",
    "gitcode_list_forks",
    "gitcode_create_fork",
    "gitcode_list_my_repos",
    # Files
    "gitcode_get_file_list",
    "gitcode_delete_file",
    "gitcode_get_blob",
    "gitcode_get_tree",
    # Branches
    "gitcode_create_branch",
    "gitcode_delete_branch",
    # Commits
    "gitcode_compare_commits",
    "gitcode_get_commit_diff",
    # Issues
    "gitcode_update_issue",
    "gitcode_list_issue_comments",
    "gitcode_update_issue_comment",
    "gitcode_delete_issue_comment",
    "gitcode_add_issue_labels",
    "gitcode_remove_issue_label",
    "gitcode_replace_issue_labels",
    "gitcode_list_user_issues",
    "gitcode_list_org_issues",
    # PRs
    "gitcode_update_pull",
    "gitcode_list_pull_commits",
    "gitcode_list_pull_comments",
    "gitcode_get_pull_comment",
    "gitcode_update_pull_comment",
    "gitcode_delete_pull_comment",
    "gitcode_check_pull_merged",
    "gitcode_list_pull_labels",
    "gitcode_add_pull_labels",
    "gitcode_remove_pull_label",
    "gitcode_assign_pull_reviewers",
    "gitcode_list_user_pulls",
    # Labels
    "gitcode_list_labels",
    "gitcode_create_label",
    "gitcode_update_label",
    "gitcode_delete_label",
    # Milestones
    "gitcode_list_milestones",
    "gitcode_get_milestone",
    "gitcode_create_milestone",
    "gitcode_update_milestone",
    "gitcode_delete_milestone",
    # Tags
    "gitcode_list_tags",
    "gitcode_create_tag",
    "gitcode_delete_tag",
    # Releases
    "gitcode_list_releases",
    "gitcode_get_latest_release",
    "gitcode_get_release",
    "gitcode_get_release_by_tag",
    "gitcode_create_release",
    "gitcode_update_release",
    # Webhooks
    "gitcode_list_webhooks",
    "gitcode_get_webhook",
    "gitcode_create_webhook",
    "gitcode_update_webhook",
    "gitcode_delete_webhook",
    "gitcode_test_webhook",
    # Members
    "gitcode_list_collaborators",
    "gitcode_get_collaborator_permission",
    "gitcode_add_collaborator",
    "gitcode_remove_collaborator",
    "gitcode_list_org_members",
    "gitcode_invite_org_member",
    "gitcode_remove_org_member",
    # Organizations
    "gitcode_get_org",
    "gitcode_update_org",
    "gitcode_list_org_repos",
    "gitcode_create_org_repo",
    "gitcode_list_user_orgs",
    # Users
    "gitcode_update_user",
    "gitcode_get_user_by_name",
    "gitcode_list_user_repos_by_name",
    "gitcode_list_user_events",
    "gitcode_list_my_starred",
    "gitcode_list_ssh_keys",
    "gitcode_add_ssh_key",
    "gitcode_delete_ssh_key",
    "gitcode_list_emails",
    # Search
    "gitcode_search_users",
}

_toolset_name = os.environ.get("GITCODE_TOOLSETS", "core").strip().lower()
if _toolset_name == "all":
    _enabled = set(_ALL_TOOLS.keys())
elif _toolset_name == "extended":
    _enabled = TOOLSET_EXTENDED
elif _toolset_name == "core":
    _enabled = TOOLSET_CORE
else:
    _enabled = set()
    for _part in _toolset_name.split(","):
        _part = _part.strip()
        if _part == "core":
            _enabled |= TOOLSET_CORE
        elif _part == "extended":
            _enabled |= TOOLSET_EXTENDED
        elif _part == "all":
            _enabled = set(_ALL_TOOLS.keys())
            break
        elif _part in _ALL_TOOLS:
            _enabled.add(_part)

for _name, _func in _ALL_TOOLS.items():
    if _name in _enabled:
        mcp.tool()(_func)


if __name__ == "__main__":
    mcp.run()
