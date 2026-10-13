from slowapi import Limiter
from slowapi.util import get_remote_address

# Um limitador só para a API inteira. O IP vem do proxy do Railway
# (uvicorn com --proxy-headers, ver Procfile e railway.toml).
limiter = Limiter(key_func=get_remote_address)

# Teto de tamanho dos arquivos importados (PDF, OFX)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
