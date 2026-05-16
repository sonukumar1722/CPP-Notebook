from fastapi import FastAPI, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, fs, notebooks
from app.core.config import settings
from app.db import init_db, get_db
from app.services.auth import get_websocket_user
from app.services.kernel import KernelRegistry
from app.services.storage import storage
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends


app = FastAPI(title=settings.app_name)

@app.on_event("startup")
async def on_startup():
    await init_db()

# Routers
app.include_router(auth.router)
app.include_router(notebooks.router)
app.include_router(fs.router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

kernel_registry = KernelRegistry(
    kernel_name=settings.kernel_name,
    idle_timeout_seconds=settings.kernel_idle_timeout_seconds,
)


@app.get("/api/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/notebooks/{notebook_path:path}")
async def notebook_socket(
    websocket: WebSocket,
    notebook_path: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    # Resolve & validate path
    try:
        user = await get_websocket_user(websocket, db)
        file_path = storage.resolve_user_file(user.id, notebook_path)
    except Exception:
        await websocket.close(code=4404)
        return

    if not file_path.exists():
        await websocket.close(code=4404)
        return

    await websocket.accept()

    workspace = file_path.parent
    session = await kernel_registry.connect(notebook_path, workspace, websocket)

    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")

            if msg_type == "execute":
                await session.execute(cell_id=message["cellId"], code=message["source"])
            elif msg_type == "input_reply":
                await session.send_input(message.get("value", ""))
            elif msg_type == "interrupt":
                await session.interrupt()
            elif msg_type == "restart":
                await session.restart()
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await kernel_registry.disconnect(notebook_path, websocket)
