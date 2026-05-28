import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings
from app.core.logging import setup_logging, correlation_id_middleware, get_logger
from app.api.v1 import auth, accounts, transactions, goals, investments, export, internal

settings = get_settings()

# Setup logging
setup_logging(settings.app_env)
logger = get_logger(__name__)

# Setup Sentry
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        release=settings.app_version,
        traces_sample_rate=0.1,
    )

# App
app = FastAPI(
    title="FlowTrack API",
    description="Personal finance API with AI-powered categorization",
    version=settings.app_version,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# Middlewares
app.add_middleware(BaseHTTPMiddleware, dispatch=correlation_id_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,         prefix="/api/v1/auth",         tags=["Auth"])
app.include_router(accounts.router,     prefix="/api/v1/accounts",     tags=["Accounts"])
app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["Transactions"])
app.include_router(goals.router,        prefix="/api/v1/goals",        tags=["Goals"])
app.include_router(investments.router,  prefix="/api/v1/investments",  tags=["Investments"])
app.include_router(export.router,       prefix="/api/v1/export",       tags=["Export"])
app.include_router(internal.router,     prefix="/internal",            tags=["Internal"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": settings.app_version, "env": settings.app_env}


@app.on_event("startup")
async def startup():
    logger.info("FlowTrack API starting", version=settings.app_version, env=settings.app_env)
