"""
main.py
-------
FastAPI application entry-point for CppNote.

Responsibilities:
  - Creates the FastAPI app instance and registers startup events.
  - Mounts the auth, notebook, and filesystem API routers.
  - Configures CORS to allow the React frontend origin.
  - Hosts the WebSocket endpoint that connects a browser session to
    a per-notebook Jupyter kernel via KernelRegistry.
"""

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


# ── App instance ───────────────────────────────────────────────────────────────
app = FastAPI(title=settings.app_name)


@app.on_event("startup")
async def on_startup():
    """Create database tables on first run (idempotent)."""
    await init_db()


# ── Routers ────────────────────────────────────────────────────────────────────
# Each router owns its own prefix (/api/auth, /api/notebooks, /api/fs)
app.include_router(auth.router)
app.include_router(notebooks.router)
app.include_router(fs.router)

# ── CORS ───────────────────────────────────────────────────────────────────────
# Allow the React dev server (and production build origin) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Kernel registry ────────────────────────────────────────────────────────────
# Shared in-process registry; one KernelSession is maintained per open notebook.
# Idle sessions are shut down after `kernel_idle_timeout_seconds`.
kernel_registry = KernelRegistry(
    kernel_name=settings.kernel_name,
    idle_timeout_seconds=settings.kernel_idle_timeout_seconds,
)


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/api/health")
async def healthcheck() -> dict[str, str]:
    """Simple liveness probe used by Docker / reverse proxies."""
    return {"status": "ok"}


# ── WebSocket — notebook kernel bridge ────────────────────────────────────────
@app.websocket("/ws/notebooks/{notebook_path:path}")
async def notebook_socket(
    websocket: WebSocket,
    notebook_path: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    WebSocket endpoint that bridges a browser tab to a Jupyter kernel.

    Protocol (JSON messages):
      Client → Server:
        { type: "execute",     cellId, source }   — run a code cell
        { type: "input_reply", value }             — respond to a stdin prompt
        { type: "interrupt" }                      — send SIGINT to the kernel
        { type: "restart" }                        — kill & restart the kernel
        { type: "ping" }                           — keep-alive heartbeat

      Server → Client:
        See KernelSession.broadcast / _pump_iopub / _pump_stdin for outbound types.
    """
    # Resolve & validate path — close with 4404 if not found or unauthorized
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

    # Connect this WebSocket to the shared kernel session for this notebook
    workspace = file_path.parent
    session = await kernel_registry.connect(notebook_path, workspace, websocket)

    try:
        # Message pump — dispatch incoming client messages to the kernel session
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")

            if msg_type == "execute":
                await session.execute(cell_id=message["cellId"], code=message["source"])
            elif msg_type == "input_reply":
                # User responded to a stdin prompt
                await session.send_input(message.get("value", ""))
            elif msg_type == "interrupt":
                await session.interrupt()
            elif msg_type == "restart":
                await session.restart()
            elif msg_type == "ping":
                # Echo a pong to keep the connection alive through proxies
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        # Clean up the subscriber; start idle-shutdown timer if no one is left
        await kernel_registry.disconnect(notebook_path, websocket)
