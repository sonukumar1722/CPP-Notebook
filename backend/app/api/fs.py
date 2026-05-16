import json
import os
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from app.models import User
from app.services.auth import get_current_user
from app.services.storage import storage

router = APIRouter(prefix="/api/fs", tags=["fs"])


class FileNode(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int
    children: list["FileNode"] | None = None


class WriteRequest(BaseModel):
    path: str
    content: str


class RenameRequest(BaseModel):
    old_path: str
    new_path: str


class DeleteRequest(BaseModel):
    path: str


def _build_tree(root_path: Path, current_path: Path, relative_to: Path) -> FileNode:
    is_dir = current_path.is_dir()
    node = FileNode(
        name=current_path.name if current_path != root_path else "root",
        path=str(current_path.relative_to(relative_to)).replace("\\", "/"),
        is_dir=is_dir,
        size=current_path.stat().st_size if not is_dir else 0,
        children=[] if is_dir else None,
    )

    if is_dir:
        for child in sorted(current_path.iterdir(), key=lambda p: (not p.is_dir(), p.name)):
            # Skip hidden files/folders
            if child.name.startswith("."):
                continue
            node.children.append(_build_tree(root_path, child, relative_to))

    return node


@router.get("/list", response_model=FileNode)
async def list_files(
    current_user: User = Depends(get_current_user),
) -> FileNode:
    user_root = storage.user_root(current_user.id)
    return _build_tree(user_root, user_root, user_root)


@router.get("/read")
async def read_file(
    path: str,
    current_user: User = Depends(get_current_user),
) -> Any:
    file_path = storage.resolve_user_file(current_user.id, path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    # If it's a binary file or image, return it as FileResponse
    ext = file_path.suffix.lower()
    if ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        return FileResponse(file_path)

    # Otherwise return as text/json
    try:
        content = file_path.read_text(encoding="utf-8")
        if ext == ".cpynb":
            return JSONResponse(content=json.loads(content))
        return {"content": content}
    except UnicodeDecodeError:
        return FileResponse(file_path)


@router.post("/write")
async def write_file(
    req: WriteRequest,
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    file_path = storage.resolve_user_file(current_user.id, req.path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(req.content, encoding="utf-8")
    return {"status": "ok"}


@router.post("/rename")
async def rename_file(
    req: RenameRequest,
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    old_path = storage.resolve_user_file(current_user.id, req.old_path)
    new_path = storage.resolve_user_file(current_user.id, req.new_path)

    if not old_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    if new_path.exists():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Destination already exists")

    new_path.parent.mkdir(parents=True, exist_ok=True)
    old_path.rename(new_path)
    return {"status": "ok"}


@router.delete("/delete")
async def delete_file(
    req: DeleteRequest,
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    path = storage.resolve_user_file(current_user.id, req.path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()
    return {"status": "ok"}


@router.post("/upload")
async def upload_file(
    path: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    target_dir = storage.resolve_user_file(current_user.id, path)
    if target_dir.exists() and not target_dir.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target path is a file, not a directory")
    
    target_dir.mkdir(parents=True, exist_ok=True)
    file_path = target_dir / (file.filename or "upload.bin")
    
    content = await file.read()
    file_path.write_bytes(content)
    
    return {"status": "ok", "path": str(file_path.relative_to(storage.user_root(current_user.id))).replace("\\", "/")}
