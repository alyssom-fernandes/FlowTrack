import logging
import uuid
import structlog
from fastapi import Request


def setup_logging(app_env: str = "development") -> None:
    """Configure structlog for structured JSON logging."""

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if app_env == "production":
        processors = shared_processors + [structlog.processors.JSONRenderer()]
        log_level = logging.INFO
    else:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True)
        ]
        log_level = logging.DEBUG

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(level=log_level)


def get_logger(name: str = __name__):
    return structlog.get_logger(name)


async def correlation_id_middleware(request: Request, call_next):
    """Add correlation ID to every request for tracing."""
    correlation_id = request.headers.get("x-correlation-id", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        correlation_id=correlation_id,
        method=request.method,
        path=request.url.path,
    )
    response = await call_next(request)
    response.headers["x-correlation-id"] = correlation_id
    return response
