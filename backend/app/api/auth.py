from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import bcrypt

from app.db import get_db
from app.models import User
from app.services.auth import create_access_token, get_current_user

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
