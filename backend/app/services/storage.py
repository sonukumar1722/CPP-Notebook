"""
services/storage.py
-------------------
Filesystem path resolution and isolation logic.

Ensures that every user has an isolated workspace folder inside the
global `workspace_root`. Prevents directory traversal attacks by
strictly validating requested relative paths.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, status

from app.core.config import settings


class WorkspaceStorage:
    """Manages secure access to user-specific filesystem workspaces."""

    def __init__(self) -> None:
        """
        Initialise storage, ensuring the global workspace root exists.
        The root is configured in `settings.workspace_root` (default: ./workspaces).
        """
        self.workspace_root = settings.workspace_root
        self.workspace_root.mkdir(parents=True, exist_ok=True)

    def user_root(self, user_id: str) -> Path:
        """
        Get the absolute Path to a specific user's root folder.
        Creates the folder if it does not already exist.

        Args:
            user_id: The UUID of the user.

        Returns:
            A pathlib.Path representing the user's isolated workspace directory.
        """
        root = self.workspace_root / user_id
        root.mkdir(parents=True, exist_ok=True)
        return root

    def resolve_user_file(self, user_id: str, relative_path: str) -> Path:
        """
        Securely resolve a requested relative path against the user's root.

        Defends against directory traversal (e.g. "../../../etc/passwd").

        Args:
            user_id: The UUID of the user.
            relative_path: The path requested by the client (e.g. "project/main.cpp").

        Returns:
            The resolved, absolute pathlib.Path.

        Raises:
            HTTPException (400): If the resolved path escapes the user's root directory.
        """
        # Get the absolute physical path of the user's root
        user_root = self.user_root(user_id).resolve()

        # Clean up leading/trailing slashes
        clean_path = relative_path.strip("/")
        
        # If the path was empty, they requested the root directory itself
        if not clean_path:
            return user_root

        # Resolve the requested path
        candidate = (user_root / clean_path).resolve()

        # Security check: Ensure the resolved path is still inside the user's root.
        # This prevents ".." sequences from breaking out of the sandbox.
        if user_root not in candidate.parents and candidate != user_root:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workspace path")
            
        return candidate


# Global singleton used by routers to access files
storage = WorkspaceStorage()
