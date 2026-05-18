"""
core/config.py
--------------
Application-wide settings loaded from environment variables.

All environment variables must be prefixed with CPPNOTE_ (e.g. CPPNOTE_DATABASE_URL).
Unrecognised variables are silently ignored (extra="ignore").
"""

from pathlib import Path
from typing import List

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

    # Root directory for file uploads
    upload_root: Path = Field(default=Path("uploads"))

    # Comma-separated list of allowed CORS origins.
    # Example: "http://localhost:5173,https://cppnote.vercel.app"
    frontend_origin: str = "http://localhost:5173"

    @property
    def allowed_origins(self) -> List[str]:
        """Parse the comma-separated origin string into a list."""
        return [o.strip() for o in self.frontend_origin.split(",") if o.strip()]

    # JWT secret — MUST be changed in production
    jwt_secret: str = "change-me"

    # PostgreSQL connection string (asyncpg driver)
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cppnote"

    # Single-user auth credentials
    user_email: str = "admin@cppnote.local"
    user_password: str = "cppnote123"
    display_name: str = "Developer"


# Global singleton — imported everywhere in the app
settings = Settings()
