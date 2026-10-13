import hmac
import time
import httpx
import jwt
from fastapi import HTTPException, Security, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
security = HTTPBearer()

_jwks_cache: dict | None = None
_jwks_cache_time: float = 0
_JWKS_TTL = 3600

# Tokens do Supabase Auth: chaves assimétricas publicadas no JWKS ou o segredo HS256 do projeto.
# O algoritmo nunca é escolhido pelo token: só estes são aceitos, cada um com o seu tipo de chave.
_JWKS_ALGS = {"ES256": "EC", "RS256": "RSA"}
_AUDIENCE = "authenticated"
_REQUIRED_CLAIMS = ["exp", "sub", "aud"]


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


def _decode_with_jwks(token: str, alg: str, kid: str | None, jwks: dict) -> dict:
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") != kid:
            continue
        if key_data.get("kty") != _JWKS_ALGS[alg] or key_data.get("alg", alg) != alg:
            raise jwt.InvalidTokenError("Key type does not match the token algorithm")
        key = jwt.PyJWK(key_data, algorithm=alg).key
        return jwt.decode(token, key, algorithms=[alg], audience=_AUDIENCE, options={"require": _REQUIRED_CLAIMS})
    raise jwt.InvalidTokenError(f"No matching JWKS key for kid={kid}")


def decode_token(token: str) -> dict:
    """Valida o token e devolve as claims. Erros viram jwt.InvalidTokenError."""
    header = jwt.get_unverified_header(token)
    alg = header.get("alg")
    if alg == "HS256":
        return jwt.decode(
            token, get_settings().supabase_jwt_secret, algorithms=["HS256"],
            audience=_AUDIENCE, options={"require": _REQUIRED_CLAIMS},
        )
    if alg in _JWKS_ALGS:
        return _decode_with_jwks(token, alg, header.get("kid"), _get_jwks())
    raise jwt.InvalidTokenError(f"Algorithm not accepted: {alg}")


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    try:
        payload = decode_token(credentials.credentials)
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        return user_id

    except HTTPException:
        raise
    except jwt.InvalidTokenError as e:
        logger.warning("JWT validation failed", error=str(e))
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception as e:
        logger.warning("JWT validation error", error=str(e))
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def verify_internal_token(x_internal_secret: str = Header(...)) -> bool:
    expected = get_settings().internal_api_token
    # Comparação em tempo constante; segredo vazio nunca libera
    if not expected or not hmac.compare_digest(x_internal_secret.encode(), expected.encode()):
        logger.warning("Invalid internal token attempt")
        raise HTTPException(status_code=403, detail="Forbidden")
    return True
