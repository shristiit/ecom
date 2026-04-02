from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=('../backend/.env', '.env', '../backend/.env.local', '.env.local'),
        env_file_encoding='utf-8',
        extra='ignore',
        env_prefix='CONVERSATIONAL_ENGINE_',
    )

    app_name: str = 'conversational-engine'
    environment: str = 'development'
    host: str = '0.0.0.0'
    port: int = 8000
    log_level: str = 'INFO'

    database_url: str = Field(
        default='postgres://user:pass@localhost:5432/stockaisle',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_DATABASE_URL', 'DATABASE_URL'),
    )
    backend_base_url: str = Field(
        default='http://localhost:4000/api',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_BACKEND_BASE_URL', 'BACKEND_BASE_URL'),
    )

    openai_api_key: str = ''
    chat_model: str = 'gpt-4.1-mini'
    embeddings_model: str = 'text-embedding-3-small'
    classifier_model: str = 'gpt-4.1-mini'

    feature_enabled: bool = True
    mutations_enabled: bool = True
    retrieval_enabled: bool = True
    cors_origins: str = 'http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081'

    @property
    def health_payload(self) -> dict[str, object]:
        return {
            'status': 'ok',
            'service': self.app_name,
            'environment': self.environment,
            'featureEnabled': self.feature_enabled,
        }

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
