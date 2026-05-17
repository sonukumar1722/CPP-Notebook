import base64
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import bcrypt

from app.db import get_db
from app.models import User
from app.services.auth import create_access_token, get_current_user
from app.core.config import settings

AVATAR_DIR = settings.workspace_root.parent / "avatars"

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str


def _profile(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat(),
    }


@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
        
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(req.password.encode('utf-8'), salt).decode('utf-8')
    new_user = User(
        email=req.email,
        hashed_password=hashed_password,
        display_name=req.display_name,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    token = create_access_token({"sub": new_user.id})
    return {"access_token": token, "token_type": "bearer", "user": _profile(new_user)}


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
        
    try:
        is_valid = bcrypt.checkpw(req.password.encode('utf-8'), user.hashed_password.encode('utf-8'))
    except ValueError:
        is_valid = False
        
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
        
    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer", "user": _profile(user)}


@router.post("/logout")
async def logout():
    return {"message": "Logged out"}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return _profile(current_user)


class ProfileUpdateJSON(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None


@router.post("/profile")
async def update_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update profile. Accepts multipart/form-data (with optional avatar file) or JSON."""
    content_type = request.headers.get("content-type", "")
    avatar_url: Optional[str] = current_user.avatar_url

    if "multipart/form-data" in content_type:
        form = await request.form()
        display_name = form.get("display_name") or current_user.display_name
        bio = form.get("bio") or current_user.bio
        avatar_file = form.get("file")

        if avatar_file and hasattr(avatar_file, "read"):
            AVATAR_DIR.mkdir(parents=True, exist_ok=True)
            ext = Path(avatar_file.filename or "avatar.jpg").suffix.lower()
            fname = f"{current_user.id}{ext}"
            dest = AVATAR_DIR / fname
            content = await avatar_file.read()
            dest.write_bytes(content)
            avatar_url = f"/api/auth/avatar/{fname}"
    else:
        body = await request.json()
        display_name = body.get("display_name") or current_user.display_name
        bio = body.get("bio", current_user.bio)

    current_user.display_name = str(display_name)
    current_user.bio = str(bio) if bio is not None else None
    current_user.avatar_url = avatar_url
    await db.commit()
    await db.refresh(current_user)
    return _profile(current_user)


@router.get("/avatar/{filename}")
async def get_avatar(filename: str):
    """Serve avatar images."""
    from fastapi.responses import FileResponse
    path = AVATAR_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(path)
