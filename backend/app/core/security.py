from fastapi import HTTPException, Security, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """
    Validates the Supabase JWT and returns the user_id (sub claim).
    Uses the Supabase JWT secret for validation — no custom JWT implementation.
    """
    settings = get_settings()
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        return user_id

    except JWTError as e:
        logger.warning("JWT validation failed", error=str(e))
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def verify_internal_token(x_internal_secret: str = Header(...)) -> bool:
    """
    Validates the internal API token for the process-queue endpoint.
    Called by the external cron job (cron-job.org) every 5 minutes.
    """
    settings = get_settings()
    if x_internal_secret != settings.internal_api_token:
        logger.warning("Invalid internal token attempt")
        raise HTTPException(status_code=403, detail="Forbidden")
    return True
