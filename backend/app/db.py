"""
db.py
-----
Async SQLAlchemy engine and session factory for CppNote.

The engine is created once at module import time.
`init_db` creates all tables on startup.
`get_db` is a FastAPI dependency that yields a per-request session.
"""

import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.core.config import settings

# Create the async engine — echo=False keeps SQL logs quiet in production
engine = create_async_engine(settings.database_url, echo=False)

# Session factory — expire_on_commit=False prevents lazy-load errors after commit
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    """
    Create all database tables defined in the ORM models.
    Called once during application startup via the FastAPI lifespan event.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an async database session.
    The session is automatically closed when the request finishes.
    """
    async with async_session() as session:
        yield session
