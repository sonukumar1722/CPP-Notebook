"""
services/kernel.py
------------------
Manages Jupyter kernel lifecycles and messaging for notebook execution.

Uses `jupyter_client` to spawn and communicate with native kernels (e.g. xeus-cling).
Handles the ZeroMQ socket communication asynchronously and multiplexes kernel
messages to connected WebSocket clients.
"""

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
    """
    Look up the frontend cell ID associated with a kernel message.
    The frontend sends a unique cell ID; we map the Jupyter msg_id to this cell ID
    so output is routed to the correct UI cell.
    """
    parent = message.get("parent_header") or {}
    msg_id = parent.get("msg_id")
    if not msg_id:
        return None
    return execution_map.get(msg_id)


@dataclass
class KernelSession:
    """
    Wraps a single Jupyter kernel instance.
    Manages the background tasks that pump messages from ZeroMQ sockets (IOPub, Stdin)
    and broadcasts them to all connected WebSocket subscribers.
    """
    # Identifier for this session (typically the notebook file path)
    notebook_id: str
    # Execution directory for the kernel
    workspace: Path
    # The name of the kernel spec to launch (e.g., "xcpp17")
    kernel_name: str
    
    # Active WebSockets listening to this kernel
    subscribers: set[WebSocket] = field(default_factory=set)
    
    # jupyter_client manager and client objects
    manager: AsyncKernelManager | None = None
    client: Any | None = None
    
    # Background asyncio tasks (IOPub loop, Stdin loop)
    tasks: list[asyncio.Task[Any]] = field(default_factory=list)
    
    # Maps Jupyter execution msg_id -> frontend cell_id
    execution_map: dict[str, str] = field(default_factory=dict)
    
    # Prevents concurrent startup/teardown races
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def start(self) -> None:
        """Start the kernel process and message pump tasks."""
        if self.manager:
            return  # Already running
            
        self.manager = AsyncKernelManager(kernel_name=self.kernel_name)
        # Launch kernel with its working directory set to the user's workspace
        await self.manager.start_kernel(cwd=str(self.workspace))
        
        self.client = self.manager.client()
        self.client.start_channels()
        
        # Wait up to 30 seconds for the kernel to bind its ZMQ sockets
        await self.client.wait_for_ready(timeout=30)
        
        # Start pumping messages from the kernel to the WebSockets
        self.tasks = [
            asyncio.create_task(self._pump_iopub()),
            asyncio.create_task(self._pump_stdin()),
        ]
        
        await self.broadcast({"type": "kernel.ready", "notebookId": self.notebook_id})

    async def stop(self) -> None:
        """Kill the kernel process and cancel background tasks."""
        # Cancel message pumps
        for task in self.tasks:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self.tasks.clear()
        
        # Shutdown ZeroMQ channels
        if self.client:
            with contextlib.suppress(Exception):
                self.client.stop_channels()
                
        # Terminate the underlying kernel process immediately
        if self.manager:
            with contextlib.suppress(Exception):
                await self.manager.shutdown_kernel(now=True)
                
        self.client = None
        self.manager = None
        self.execution_map.clear()

    async def execute(self, cell_id: str, code: str) -> None:
        """
        Send code to the kernel for execution.
        Maps the returned msg_id to the UI cell_id so output finds its way back.
        """
        async with self.lock:
            # Lazy-start the kernel if it crashed or wasn't running
            if not self.client:
                await self.start()
                
            msg_id = self.client.execute(code, store_history=True, allow_stdin=True, stop_on_error=True)
            self.execution_map[msg_id] = cell_id
            
            await self.broadcast({"type": "cell.queued", "cellId": cell_id})

    async def interrupt(self) -> None:
        """Send SIGINT to the kernel to interrupt long-running code."""
        if self.manager:
            await self.manager.interrupt_kernel()
            await self.broadcast({"type": "kernel.interrupted"})

    async def restart(self) -> None:
        """Hard restart of the kernel process (clears state/memory)."""
        await self.stop()
        await self.start()
        await self.broadcast({"type": "kernel.restarted"})

    async def send_input(self, value: str) -> None:
        """Send a string to the kernel's stdin channel (for std::cin / input())."""
        if self.client:
            self.client.input(value)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Send a JSON message to all connected WebSockets."""
        stale: list[WebSocket] = []
        for socket in self.subscribers:
            try:
                await socket.send_json(message)
            except Exception:
                # Socket disconnected unexpectedly
                stale.append(socket)
                
        # Clean up dead connections
        for socket in stale:
            self.subscribers.discard(socket)

    async def _pump_iopub(self) -> None:
        """
        Background task: reads messages from the IOPub channel
        (stdout, stderr, display data, execution status) and broadcasts them.
        """
        assert self.client is not None
        while True:
            try:
                message = await self.client.get_iopub_msg(timeout=1)
            except (asyncio.TimeoutError, Empty):
                continue
                
            msg_type = message.get("msg_type")
            content = message.get("content", {})
            cell_id = _cell_id_from_parent(message, self.execution_map)

            # Map Jupyter protocol messages to our custom frontend JSON schema
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
                        "stream": content.get("name"),  # stdout or stderr
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
        """
        Background task: reads messages from the stdin channel.
        When the kernel requests input, we broadcast a prompt event to the UI.
        """
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
    """
    Manages the lifecycle of multiple KernelSessions across the app.
    Ensures that multiple clients opening the same notebook share a single kernel.
    Handles graceful shutdown of kernels when all clients disconnect.
    """
    def __init__(self, kernel_name: str, idle_timeout_seconds: int) -> None:
        self.default_kernel_name = kernel_name
        self.idle_timeout_seconds = idle_timeout_seconds
        
        # notebook_id -> KernelSession
        self.sessions: dict[str, KernelSession] = {}
        
        # notebook_id -> asyncio.Task (waiting to terminate idle kernels)
        self.shutdown_tasks: dict[str, asyncio.Task[Any]] = {}

    async def get_or_create(self, notebook_id: str, workspace: Path, kernel_name: str | None = None) -> KernelSession:
        """Get an existing session or start a new one."""
        # Cancel any pending shutdown timer if a client reconnects
        shutdown_task = self.shutdown_tasks.pop(notebook_id, None)
        if shutdown_task:
            shutdown_task.cancel()
            
        selected_kernel = kernel_name or self.default_kernel_name
        session = self.sessions.get(notebook_id)
        
        if session:
            # If the user changed the kernel type, restart with the new type
            if session.kernel_name != selected_kernel:
                await session.stop()
                self.sessions.pop(notebook_id, None)
            else:
                return session
                
        # Create and start a new session
        session = KernelSession(notebook_id=notebook_id, workspace=workspace, kernel_name=selected_kernel)
        await session.start()
        self.sessions[notebook_id] = session
        return session

    async def connect(
        self, notebook_id: str, workspace: Path, websocket: WebSocket, kernel_name: str | None = None
    ) -> KernelSession:
        """Register a new WebSocket connection to a session."""
        session = await self.get_or_create(notebook_id, workspace, kernel_name)
        session.subscribers.add(websocket)
        return session

    async def disconnect(self, notebook_id: str, websocket: WebSocket) -> None:
        """Unregister a WebSocket. If it's the last one, start the idle timer."""
        session = self.sessions.get(notebook_id)
        if not session:
            return
            
        session.subscribers.discard(websocket)
        
        # If no clients remain, queue the kernel for shutdown after a delay
        if not session.subscribers:
            self.shutdown_tasks[notebook_id] = asyncio.create_task(self._shutdown_later(notebook_id))

    async def _shutdown_later(self, notebook_id: str) -> None:
        """Wait for `idle_timeout_seconds`, then shut down the kernel if still empty."""
        try:
            await asyncio.sleep(self.idle_timeout_seconds)
            session = self.sessions.get(notebook_id)
            if session and not session.subscribers:
                await session.stop()
                self.sessions.pop(notebook_id, None)
        finally:
            self.shutdown_tasks.pop(notebook_id, None)
