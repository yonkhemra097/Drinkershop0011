from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite:///./dev.db"
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:3000"
    session_lifetime_minutes: int = 60 * 24 * 7
    idle_timeout_minutes: int = 60 * 8
    max_failed_logins: int = 5
    lockout_minutes: int = 15


settings = Settings()
