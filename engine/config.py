"""Shared configuration for all engine workers."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://echo:echo@db:5432/echome"
    redis_url: str = "redis://redis:6379"
    openai_api_key: str = ""
    elevenlabs_api_key: str = ""
    heygen_api_key: str = ""
    heygen_base_url: str = "https://api.heygen.com"
    heygen_train_endpoint: str = ""
    telegram_bot_token: str = ""
    rapidapi_key: str = ""
    rapidapi_host: str = "youtube-mp310.p.rapidapi.com"
    chroma_host: str = "chroma"
    chroma_port: int = 8000
    data_dir: str = "/data"

    class Config:
        env_file = ".env"


settings = Settings()
