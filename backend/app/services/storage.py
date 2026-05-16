from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, status

from app.core.config import settings


class WorkspaceStorage:
    def __init__(self) -> None:
        self.workspace_root = settings.workspace_root
        self.workspace_root.mkdir(parents=True, exist_ok=True)

    def user_root(self, user_id: str) -> Path:
        root = self.workspace_root / user_id
        root.mkdir(parents=True, exist_ok=True)
        return root

    def resolve_user_file(self, user_id: str, relative_path: str) -> Path:
        user_root = self.user_root(user_id).resolve()
        # Clean up path to prevent traversal
        clean_path = relative_path.strip("/")
        if not clean_path:
            return user_root
            
        candidate = (user_root / clean_path).resolve()
        if user_root not in candidate.parents and candidate != user_root:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workspace path")
        return candidate


storage = WorkspaceStorage()
