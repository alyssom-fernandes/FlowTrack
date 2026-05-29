import time
import httpx
from fastapi import HTTPException, Security, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, jwk as jose_jwk, JWTError
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
security = HTTPBearer()

_jwks_cache: dict | None = None
_jwks_cache_time: float = 0
_JWKS_TTL = 3600


def _get_jwks() -> dict:
    global _jwks_cache, _jwks_cache_time
    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < _JWKS_TTL:
        return _jwks_cache
    settings = get_settings()
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, headers={"apikey": settings.supabase_anon_key}, timeout=10)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    _jwks_cache_time = now
    return _jwks_cache


def _decode_with_jwks(token: str, jwks: dict) -> dict:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    alg = header.get("alg", "ES256")
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            public_key = jose_jwk.construct(key_data, algorithm=alg)
            return jwt.decode(token, public_key, algorithms=[alg], options={"verify_aud": False})
    raise JWTError(f"No matching JWKS key for kid={kid}")


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    settings = get_settings()
    token = credentials.credentials

    try:
        alg = jwt.get_unverified_header(token).get("alg", "HS256")

        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            payload = _decode_with_jwks(token, _get_jwks())

        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        return user_id

    except JWTError as e:
        logger.warning("JWT validation failed", error=str(e))
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception as e:
        logger.warning("JWT validation error", error=str(e))
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def verify_internal_token(x_internal_secret: str = Header(...)) -> bool:
    settings = get_settings()
    if x_internal_secret != settings.internal_api_token:
        logger.warning("Invalid internal token attempt")
        raise HTTPException(status_code=403, detail="Forbidden")
    return True
