from __future__ import annotations

import asyncio
import contextlib
from dataclasses import dataclass, field
from pathlib import Path
from queue import Empty
from typing import Any

from fastapi import WebSocket
from jupyter_client.manager import AsyncKernelManager


def _cell_id_from_parent(message: dict[str, Any], execution_map: dict[str, str]) -> str | None:
    parent = message.get("parent_header") or {}
    msg_id = parent.get("msg_id")
    if not msg_id:
        return None
    return execution_map.get(msg_id)


@dataclass
class KernelSession:
    notebook_id: str
    workspace: Path
    kernel_name: str
    subscribers: set[WebSocket] = field(default_factory=set)
    manager: AsyncKernelManager | None = None
    client: Any | None = None
    tasks: list[asyncio.Task[Any]] = field(default_factory=list)
    execution_map: dict[str, str] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def start(self) -> None:
        if self.manager:
            return
        self.manager = AsyncKernelManager(kernel_name=self.kernel_name)
        await self.manager.start_kernel(cwd=str(self.workspace))
        self.client = self.manager.client()
        self.client.start_channels()
        await self.client.wait_for_ready(timeout=30)
        self.tasks = [
            asyncio.create_task(self._pump_iopub()),
            asyncio.create_task(self._pump_stdin()),
        ]
        await self.broadcast({"type": "kernel.ready", "notebookId": self.notebook_id})

    async def stop(self) -> None:
        for task in self.tasks:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self.tasks.clear()
        if self.client:
            with contextlib.suppress(Exception):
                self.client.stop_channels()
        if self.manager:
            with contextlib.suppress(Exception):
                await self.manager.shutdown_kernel(now=True)
        self.client = None
        self.manager = None
        self.execution_map.clear()

    async def execute(self, cell_id: str, code: str) -> None:
        async with self.lock:
            if not self.client:
                await self.start()
            msg_id = self.client.execute(code, store_history=True, allow_stdin=True, stop_on_error=True)
            self.execution_map[msg_id] = cell_id
            await self.broadcast({"type": "cell.queued", "cellId": cell_id})

    async def interrupt(self) -> None:
        if self.manager:
            await self.manager.interrupt_kernel()
            await self.broadcast({"type": "kernel.interrupted"})

    async def restart(self) -> None:
        await self.stop()
        await self.start()
        await self.broadcast({"type": "kernel.restarted"})

    async def send_input(self, value: str) -> None:
        if self.client:
            self.client.input(value)

    async def broadcast(self, message: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for socket in self.subscribers:
            try:
                await socket.send_json(message)
            except Exception:
                stale.append(socket)
        for socket in stale:
            self.subscribers.discard(socket)

    async def _pump_iopub(self) -> None:
        assert self.client is not None
        while True:
            try:
                message = await self.client.get_iopub_msg(timeout=1)
            except (asyncio.TimeoutError, Empty):
                continue
            msg_type = message.get("msg_type")
            content = message.get("content", {})
            cell_id = _cell_id_from_parent(message, self.execution_map)

            if msg_type == "status":
                await self.broadcast(
                    {
                        "type": "kernel.status",
                        "cellId": cell_id,
                        "state": content.get("execution_state"),
                    }
                )
            elif msg_type == "stream":
                await self.broadcast(
                    {
                        "type": "cell.stream",
                        "cellId": cell_id,
                        "stream": content.get("name"),
                        "text": content.get("text", ""),
                    }
                )
            elif msg_type == "error":
                await self.broadcast(
                    {
                        "type": "cell.error",
                        "cellId": cell_id,
                        "ename": content.get("ename"),
                        "evalue": content.get("evalue"),
                        "traceback": content.get("traceback", []),
                    }
                )
            elif msg_type == "execute_result":
                await self.broadcast(
                    {
                        "type": "cell.result",
                        "cellId": cell_id,
                        "data": content.get("data", {}),
                        "metadata": content.get("metadata", {}),
                    }
                )
            elif msg_type == "display_data":
                await self.broadcast(
                    {
                        "type": "cell.display",
                        "cellId": cell_id,
                        "data": content.get("data", {}),
                        "metadata": content.get("metadata", {}),
                    }
                )
            elif msg_type == "clear_output":
                await self.broadcast({"type": "cell.clear", "cellId": cell_id})
            elif msg_type == "execute_input":
                await self.broadcast(
                    {
                        "type": "cell.running",
                        "cellId": cell_id,
                        "executionCount": content.get("execution_count"),
                    }
                )

    async def _pump_stdin(self) -> None:
        assert self.client is not None
        while True:
            try:
                message = await self.client.get_stdin_msg(timeout=1)
            except (asyncio.TimeoutError, Empty):
                continue
            content = message.get("content", {})
            cell_id = _cell_id_from_parent(message, self.execution_map)
            await self.broadcast(
                {
                    "type": "cell.input_request",
                    "cellId": cell_id,
                    "prompt": content.get("prompt", ""),
                    "password": content.get("password", False),
                }
            )


class KernelRegistry:
    def __init__(self, kernel_name: str, idle_timeout_seconds: int) -> None:
        self.default_kernel_name = kernel_name
        self.idle_timeout_seconds = idle_timeout_seconds
        self.sessions: dict[str, KernelSession] = {}
        self.shutdown_tasks: dict[str, asyncio.Task[Any]] = {}

    async def get_or_create(self, notebook_id: str, workspace: Path, kernel_name: str | None = None) -> KernelSession:
        shutdown_task = self.shutdown_tasks.pop(notebook_id, None)
        if shutdown_task:
            shutdown_task.cancel()
        selected_kernel = kernel_name or self.default_kernel_name
        session = self.sessions.get(notebook_id)
        if session:
            if session.kernel_name != selected_kernel:
                await session.stop()
                self.sessions.pop(notebook_id, None)
            else:
                return session
        session = KernelSession(notebook_id=notebook_id, workspace=workspace, kernel_name=selected_kernel)
        await session.start()
        self.sessions[notebook_id] = session
        return session

    async def connect(
        self, notebook_id: str, workspace: Path, websocket: WebSocket, kernel_name: str | None = None
    ) -> KernelSession:
        session = await self.get_or_create(notebook_id, workspace, kernel_name)
        session.subscribers.add(websocket)
        return session

    async def disconnect(self, notebook_id: str, websocket: WebSocket) -> None:
        session = self.sessions.get(notebook_id)
        if not session:
            return
        session.subscribers.discard(websocket)
        if not session.subscribers:
            self.shutdown_tasks[notebook_id] = asyncio.create_task(self._shutdown_later(notebook_id))

    async def _shutdown_later(self, notebook_id: str) -> None:
        try:
            await asyncio.sleep(self.idle_timeout_seconds)
            session = self.sessions.get(notebook_id)
            if session and not session.subscribers:
                await session.stop()
                self.sessions.pop(notebook_id, None)
        finally:
            self.shutdown_tasks.pop(notebook_id, None)
