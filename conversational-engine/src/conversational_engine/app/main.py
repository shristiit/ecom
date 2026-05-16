from __future__ import annotations

from contextlib import asynccontextmanager

import boto3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis
import logging

from conversational_engine.app.dependencies import build_app_services
from conversational_engine.app.routes import chat_router, router
from conversational_engine.config.settings import get_settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.ai_memory_backend == 'mongo' and not settings.mongo_uri:
        raise RuntimeError('MONGO_URI is required when AI_MEMORY_BACKEND=mongo')

    mongo_client = AsyncIOMotorClient(
        settings.mongo_uri,
        maxPoolSize=settings.mongo_max_pool_size,
        minPoolSize=settings.mongo_min_pool_size,
        serverSelectionTimeoutMS=settings.mongo_server_selection_timeout_ms,
        retryWrites=True,
        tz_aware=True,
    )
    redis_client = Redis.from_url(settings.redis_url) if settings.redis_url else None
    if redis_client is not None:
        try:
            await redis_client.ping()
        except Exception as exc:
            logger.warning('Redis disabled at startup: %s', exc)
            await redis_client.close()
            redis_client = None
    s3_client = boto3.client('s3', region_name=settings.aws_region or None)

    app.state.settings = settings
    app.state.mongo_client = mongo_client
    app.state.redis_client = redis_client
    app.state.s3_client = s3_client
    app.state.services = build_app_services(
        settings=settings,
        mongo_client=mongo_client,
        redis_client=redis_client,
        s3_client=s3_client,
    )
    try:
        yield
    finally:
        await app.state.services.backend_client.aclose()
        mongo_client.close()
        if redis_client is not None:
            await redis_client.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title='Conversational Engine',
        version='0.1.0',
        docs_url='/docs',
        redoc_url='/redoc',
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    app.include_router(router)
    app.include_router(chat_router)
    app.state.settings = settings
    return app


app = create_app()
