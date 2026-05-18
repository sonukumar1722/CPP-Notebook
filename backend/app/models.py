"""
models.py
---------
SQLAlchemy ORM models for the CppNote database.

Uses the modern Mapped / mapped_column API introduced in SQLAlchemy 2.0.
The Base class is shared across all models so that a single
`Base.metadata.create_all` call initialises the full schema.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base — all ORM models inherit from this."""
    pass


def _uuid() -> str:
    """Generate a random UUID string used as a primary key default."""
    return str(uuid.uuid4())


def _now() -> datetime:
    """Return the current UTC datetime (timezone-aware)."""
    return datetime.now(timezone.utc)


class User(Base):
    """Represents a registered CppNote user."""

    __tablename__ = "users"

    # Unique identifier (UUID stored as a string for portability)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)

    # Login email — must be unique across all users
    email: Mapped[str] = mapped_column(String, unique=True, index=True)

    # bcrypt-hashed password — never stored in plain text
    hashed_password: Mapped[str] = mapped_column(String)

    # Name shown in the UI
    display_name: Mapped[str] = mapped_column(String)

    # Optional short biography visible on the profile page
    bio: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Relative URL to the uploaded avatar image, or None if not set
    avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Account creation timestamp (UTC)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
