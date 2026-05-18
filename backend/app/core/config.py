"""
core/config.py
--------------
Application-wide settings loaded from environment variables.

All environment variables must be prefixed with CPPNOTE_ (e.g. CPPNOTE_DATABASE_URL).
Unrecognised variables are silently ignored (extra="ignore").
"""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Read env-vars with the CPPNOTE_ prefix; ignore unknown keys
    model_config = SettingsConfigDict(env_prefix="CPPNOTE_", extra="ignore")

    # Human-readable API title shown in the OpenAPI docs
    app_name: str = "CppNote API"

    # Jupyter kernel name used when launching a new kernel session
    kernel_name: str = "xcpp17"

    # How many seconds an idle kernel waits before being automatically shut down
    kernel_idle_timeout_seconds: int = 900

    # Root directory that holds every user's workspace sub-folder
    workspace_root: Path = Field(default=Path("workspaces"))

    # URL of the React dev-server — used in the CORS allow-list
    frontend_origin: str = "http://localhost:5173"

    # PostgreSQL connection string (asyncpg driver)
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cppnote"

    # Single-user auth (no longer primarily used, but keeping defaults)
    user_email: str = "admin@cppnote.local"
    user_password: str = "cppnote123"
    display_name: str = "Developer"


# Global singleton — imported everywhere in the app
settings = Settings()
