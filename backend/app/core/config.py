from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CPPNOTE_", extra="ignore")

    app_name: str = "CppNote API"
    kernel_name: str = "xcpp17"
    kernel_idle_timeout_seconds: int = 900
    workspace_root: Path = Field(default=Path("workspaces"))
    frontend_origin: str = "http://localhost:5173"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cppnote"

    # Single-user auth (no longer primarily used, but keeping defaults)
    user_email: str = "admin@cppnote.local"
    user_password: str = "cppnote123"
    display_name: str = "Developer"


settings = Settings()
