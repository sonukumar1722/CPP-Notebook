"""
services/auth.py
----------------
JWT-based authentication helpers for CppNote.

Provides:
  - `create_access_token`  — signs a JWT payload and returns the encoded token.
  - `get_current_user`     — FastAPI dependency that validates the Bearer token
                             from an HTTP request and returns the active User.
  - `get_websocket_user`   — Same validation, but reads the token from the
                             WebSocket query-string (browsers can't set headers
                             for native WebSocket connections).
"""

import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User

# ── JWT configuration ──────────────────────────────────────────────────────────
# The secret is read from the environment; fall back to a dev default.
# IMPORTANT: Set CPPNOTE_JWT_SECRET to a strong random value in production.
SECRET_KEY = os.getenv("CPPNOTE_JWT_SECRET", "super-secret-key-change-me")

# Signing algorithm — HS256 is standard for symmetric JWTs
ALGORITHM = "HS256"

# Token validity: 1 week; users stay logged in without re-authenticating
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week

# OAuth2 scheme — tells FastAPI where to look for the Bearer token in requests
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict) -> str:
    """
    Sign `data` as a JWT and return the encoded string.

    Args:
        data: Payload claims to embed (e.g. {"sub": user_id}).

    Returns:
        A signed JWT string valid for ACCESS_TOKEN_EXPIRE_MINUTES minutes.
    """
    to_encode = data.copy()
    # Attach the expiry claim so jose can enforce it automatically on decode
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    """
    FastAPI dependency — extract and validate the Bearer JWT from the request.

    Raises HTTP 401 if:
      - The token is missing or malformed.
      - The `sub` (user ID) claim is absent.
      - No user with that ID exists in the database.

    Returns:
        The authenticated User ORM instance.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decode and verify signature + expiry in one step
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Confirm the user still exists in the database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


async def get_websocket_user(websocket: WebSocket, db: AsyncSession) -> User:
    """
    Authenticate a WebSocket client via a `token` query parameter.

    Browsers cannot attach Authorization headers to WebSocket upgrades,
    so the client passes its JWT as ?token=<value> in the URL instead.

    Raises HTTP 401 if the token is missing, invalid, or the user is not found.

    Returns:
        The authenticated User ORM instance.
    """
    # Extract the token from the query string
    token = websocket.query_params.get("token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    # Look up the user in the database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user
