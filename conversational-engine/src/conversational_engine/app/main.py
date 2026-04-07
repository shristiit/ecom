from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from conversational_engine.app.routes import chat_router, router
from conversational_engine.config.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title='Conversational Engine',
        version='0.1.0',
        docs_url='/docs',
        redoc_url='/redoc',
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
