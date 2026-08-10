import asyncio
import json
import sys
from collections.abc import Awaitable, Callable
from typing import Any

from mcp.types import TextContent, Tool


class Server:
    """Minimal MCP stdio server for the tools used by CodeToGraph."""

    def __init__(self, name: str):
        self.name = name
        self._list_tools: Callable[[], Awaitable[list[Tool]]] | None = None
        self._call_tool: Callable[[str, dict[str, Any]], Awaitable[list[TextContent]]] | None = None

    def list_tools(self):
        def register(callback: Callable[[], Awaitable[list[Tool]]]):
            self._list_tools = callback
            return callback

        return register

    def call_tool(self):
        def register(callback: Callable[[str, dict[str, Any]], Awaitable[list[TextContent]]]):
            self._call_tool = callback
            return callback

        return register

    def create_initialization_options(self) -> dict[str, Any]:
        return {}

    async def run(self, _read: Any, _write: Any, _options: dict[str, Any]) -> None:
        while line := await asyncio.to_thread(sys.stdin.buffer.readline):
            try:
                request = json.loads(line)
                response = await self._dispatch(request)
            except Exception as error:
                response = {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {"code": -32603, "message": str(error)},
                }
            if response is None:
                continue
            sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
            sys.stdout.flush()

    async def _dispatch(self, request: dict[str, Any]) -> dict[str, Any] | None:
        request_id = request.get("id")
        method = request.get("method")
        if request_id is None:
            return None
        if method == "initialize":
            params = request.get("params") or {}
            return self._result(request_id, {
                "protocolVersion": params.get("protocolVersion", "2025-06-18"),
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": self.name, "version": "1.0.0"},
            })
        if method == "ping":
            return self._result(request_id, {})
        if method == "tools/list" and self._list_tools:
            return self._result(request_id, {"tools": [tool.to_dict() for tool in await self._list_tools()]})
        if method == "tools/call" and self._call_tool:
            params = request.get("params") or {}
            content = await self._call_tool(params.get("name", ""), params.get("arguments") or {})
            return self._result(request_id, {"content": [item.to_dict() for item in content], "isError": False})
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }

    @staticmethod
    def _result(request_id: Any, result: Any) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": request_id, "result": result}
