import contextlib
from collections.abc import AsyncIterator

from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.types import Receive, Scope, Send

from mcp.server import Server

async def start_http_server(server: Server, port: int, endpoint: str):
    session_manager = StreamableHTTPSessionManager(
        app=server,
        event_store=None,
        json_response=True,
        stateless=True,
    )

    async def handle_streamable_http(
        scope: Scope, receive: Receive, send: Send
    ) -> None:
        await session_manager.handle_request(scope, receive, send)

    @contextlib.asynccontextmanager
    async def lifespan(app: Starlette) -> AsyncIterator[None]:
        """Context manager for session manager."""
        async with session_manager.run():
            try:
                yield
            finally:
                pass

    # Create an ASGI application using the transport
    starlette_app = Starlette(
        debug=False,
        routes=[
            Mount(endpoint, app=handle_streamable_http),
        ],
        lifespan=lifespan,
    )

    import uvicorn

    host = "0.0.0.0"

    config = uvicorn.Config(starlette_app, host=host, port=port, loop="asyncio")
    http_server = uvicorn.Server(config)

    await http_server.serve()