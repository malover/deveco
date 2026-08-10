from contextlib import asynccontextmanager
from typing import Any, AsyncIterator


@asynccontextmanager
async def stdio_server() -> AsyncIterator[tuple[Any, Any]]:
    yield None, None
