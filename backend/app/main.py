import sentry_sdk
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings
from app.core.logging import setup_logging, correlation_id_middleware, get_logger
from app.core.rate_limit import limiter, MAX_UPLOAD_BYTES
from app.api.v1.routers import router, internal_router

settings = get_settings()
setup_logging(settings.app_env)
logger = get_logger(__name__)

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        release=settings.app_version,
        traces_sample_rate=0.1,
    )



@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("FlowTrack API starting", version=settings.app_version, env=settings.app_env)
    yield
    logger.info("FlowTrack API shutting down")


app = FastAPI(
    title="FlowTrack API",
    description="Personal finance API with AI-powered categorization",
    version=settings.app_version,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)



async def body_size_limit(request: Request, call_next):
    """Recusa corpos maiores que o teto de upload antes de ler (folga de 1 MB para o multipart)."""
    size = request.headers.get("content-length")
    if request.method in ("POST", "PUT", "PATCH") and not size and request.headers.get("transfer-encoding"):
        return JSONResponse(status_code=411, content={"detail": "Envie o tamanho do corpo (Content-Length)."})
    if size and size.isdigit() and int(size) > MAX_UPLOAD_BYTES + 1024 * 1024:
        return JSONResponse(status_code=413, content={"detail": "O arquivo passa de 10 MB."})
    return await call_next(request)


app.add_middleware(BaseHTTPMiddleware, dispatch=body_size_limit)
app.add_middleware(BaseHTTPMiddleware, dispatch=correlation_id_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(internal_router, prefix="/internal")


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
