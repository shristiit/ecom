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
    ai_memory_backend: str = Field(
        default='mongo',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_AI_MEMORY_BACKEND', 'AI_MEMORY_BACKEND'),
    )

    database_url: str = Field(
        default='postgres://user:pass@localhost:5432/stockaisle',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_DATABASE_URL', 'DATABASE_URL'),
    )
    mongo_uri: str = Field(
        default='',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_MONGO_URI', 'MONGO_URI'),
    )
    mongo_database: str = Field(
        default='ecom_ai',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_MONGO_DATABASE', 'MONGO_DATABASE'),
    )
    mongo_max_pool_size: int = Field(
        default=100,
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_MONGO_MAX_POOL_SIZE', 'MONGO_MAX_POOL_SIZE'),
    )
    mongo_min_pool_size: int = Field(
        default=0,
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_MONGO_MIN_POOL_SIZE', 'MONGO_MIN_POOL_SIZE'),
    )
    mongo_server_selection_timeout_ms: int = Field(
        default=5000,
        validation_alias=AliasChoices(
            'CONVERSATIONAL_ENGINE_MONGO_SERVER_SELECTION_TIMEOUT_MS',
            'MONGO_SERVER_SELECTION_TIMEOUT_MS',
        ),
    )
    redis_url: str = Field(
        default='',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_REDIS_URL', 'REDIS_URL'),
    )
    aws_region: str = Field(
        default='',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_AWS_REGION', 'AWS_REGION'),
    )
    s3_chat_attachments_bucket: str = Field(
        default='',
        validation_alias=AliasChoices(
            'CONVERSATIONAL_ENGINE_S3_CHAT_ATTACHMENTS_BUCKET',
            'S3_CHAT_ATTACHMENTS_BUCKET',
        ),
    )
    ai_vector_search_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_AI_VECTOR_SEARCH_ENABLED', 'AI_VECTOR_SEARCH_ENABLED'),
    )
    chat_attachment_max_bytes: int = Field(
        default=10 * 1024 * 1024,
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_CHAT_ATTACHMENT_MAX_BYTES', 'CHAT_ATTACHMENT_MAX_BYTES'),
    )
    chat_recent_message_limit: int = Field(
        default=20,
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_CHAT_RECENT_MESSAGE_LIMIT', 'CHAT_RECENT_MESSAGE_LIMIT'),
    )
    chat_max_context_messages: int = Field(
        default=30,
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_CHAT_MAX_CONTEXT_MESSAGES', 'CHAT_MAX_CONTEXT_MESSAGES'),
    )
    chat_summary_trigger_messages: int = Field(
        default=40,
        validation_alias=AliasChoices(
            'CONVERSATIONAL_ENGINE_CHAT_SUMMARY_TRIGGER_MESSAGES',
            'CHAT_SUMMARY_TRIGGER_MESSAGES',
        ),
    )
    backend_base_url: str = Field(
        default='http://localhost:4000/api',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_BACKEND_BASE_URL', 'BACKEND_BASE_URL'),
    )

    llm_base_url: str = Field(
        default='https://api.openai.com/v1',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_LLM_BASE_URL', 'OPENAI_BASE_URL'),
    )
    llm_api_key: str = Field(
        default='',
        validation_alias=AliasChoices(
            'CONVERSATIONAL_ENGINE_LLM_API_KEY',
            'CONVERSATIONAL_ENGINE_OPENAI_API_KEY',
            'OPENAI_API_KEY',
            'CONVERSATIONAL_ENGINE_API_KEY',
        ),
    )

    model_best: str = Field(
        default='gpt-4.1',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_MODEL_BEST', 'MODEL_BEST'),
    )
    model_ok: str = Field(
        default='gpt-4.1-mini',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_MODEL_OK', 'MODEL_OK'),
    )
    embeddings_model: str = Field(
        default='text-embedding-3-small',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_EMBEDDINGS_MODEL', 'EMBEDDINGS_MODEL'),
    )
    agent_model_tiers: str = Field(
        default='',
        validation_alias=AliasChoices('CONVERSATIONAL_ENGINE_AGENT_MODEL_TIERS', 'AGENT_MODEL_TIERS'),
    )

    # Backwards-compatible legacy fields (prefer llm_api_key + model_ok/model_best above).
    openai_api_key: str = ''
    chat_model: str = 'gpt-4.1-mini'
    classifier_model: str = 'gpt-4.1-mini'
    gemini_api_key: str = ''
    deepseek_api_key: str = ''
    gemini_base_url: str = 'https://generativelanguage.googleapis.com/v1beta'
    deepseek_base_url: str = 'https://api.deepseek.com/v1'

    planner_provider_chain: str = 'openai,gemini,deepseek'
    executor_provider_chain: str = 'openai,gemini,deepseek'
    reviewer_provider_chain: str = 'openai,gemini,deepseek'
    narrator_provider_chain: str = 'openai,gemini,deepseek'

    openai_planner_model: str = 'gpt-4.1'
    openai_executor_model: str = 'gpt-4.1-mini'
    openai_reviewer_model: str = 'gpt-4.1'
    openai_narrator_model: str = 'gpt-4.1-mini'

    gemini_planner_model: str = 'gemini-2.5-flash'
    gemini_executor_model: str = 'gemini-2.5-flash'
    gemini_reviewer_model: str = 'gemini-2.5-flash'
    gemini_narrator_model: str = 'gemini-2.5-flash'

    deepseek_planner_model: str = 'deepseek-chat'
    deepseek_executor_model: str = 'deepseek-chat'
    deepseek_reviewer_model: str = 'deepseek-chat'
    deepseek_narrator_model: str = 'deepseek-chat'

    feature_enabled: bool = True
    mutations_enabled: bool = True
    retrieval_enabled: bool = True
    cors_origins: str = (
        'http://localhost:8081,'
        'http://localhost:19006,'
        'http://127.0.0.1:8081,'
        'http://127.0.0.1:19006,'
        'http://dev.stockaisle.test,'
        'http://dev.stockaisle.test:8081,'
        'http://dev.stockaisle.test:19006'
    )

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
