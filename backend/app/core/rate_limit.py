import jwt
from slowapi import Limiter
from starlette.requests import Request


def client_key(request: Request) -> str:
    """Quem conta para o limite de taxa.

    Rotas autenticadas: o usuário do token (o FastAPI já validou o token antes de chegar aqui,
    então ler o sub sem verificar a assinatura de novo é seguro). Sem token: o último IP do
    X-Forwarded-For, que é o acrescentado pelo proxy da plataforma; o primeiro, o cliente forja.
    """
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            sub = jwt.decode(auth[7:], options={"verify_signature": False}).get("sub")
            if sub:
                return f"user:{sub}"
        except jwt.PyJWTError:
            pass
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return "ip:" + forwarded.split(",")[-1].strip()
    return "ip:" + (request.client.host if request.client else "unknown")


# Um limitador só para a API inteira
limiter = Limiter(key_func=client_key)

# Teto de tamanho dos arquivos importados (PDF, OFX)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
