from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form

from app.core.security import get_current_user_id
from app.core.database import get_supabase
from app.core.logging import get_logger
from app.core.rate_limit import limiter, MAX_UPLOAD_BYTES
from app.api.v1._helpers import normalize_desc, dedup_hash, _adjust_account_balance, _parse_ofx, _require_account, suggest_categories

router = APIRouter()
logger = get_logger(__name__)


async def _read_upload(file: UploadFile) -> bytes:
    """Lê o arquivo enviado e recusa os maiores que o teto (10 MB)."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "O arquivo passa de 10 MB.")
    return data


@router.post("/import/pdf/parse", tags=["Import"])
@limiter.limit("10/minute")
async def parse_pdf_preview(request: Request, file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    """Parse PDF and return transactions without saving — for preview before import."""
    from app.integrations.pdf_parser import parse_pdf, BANK_LABELS
    if not (file.filename or '').lower().endswith('.pdf'):
        raise HTTPException(400, "O arquivo deve ser um PDF.")
    pdf_bytes = await _read_upload(file)
    bank, transactions = parse_pdf(pdf_bytes)
    if bank == 'unknown':
        raise HTTPException(422, "Banco não reconhecido. Suportados: Nubank, Sicredi, Mercado Pago, Will Bank.")
    if not transactions:
        label = BANK_LABELS.get(bank, bank)
        raise HTTPException(422, f"O PDF foi identificado como {label}, mas nenhuma transação pôde ser extraída. Tente exportar novamente pelo app do banco.")
    return {'bank': BANK_LABELS.get(bank, bank), 'transactions': _with_suggestions(transactions, user_id)}


def _with_suggestions(transactions: list[dict], user_id: str) -> list[dict]:
    """Categoria sugerida na prévia; se falhar, a prévia segue sem sugestão."""
    try:
        return suggest_categories(get_supabase(), transactions, user_id)
    except Exception as e:
        logger.warning("suggest_categories_failed", error=str(e))
        return transactions


@router.post("/import/pdf", tags=["Import"])
@limiter.limit("10/minute")
async def import_pdf(
    request: Request,
    account_id: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    from app.integrations.pdf_parser import parse_pdf, BANK_LABELS
    if not (file.filename or '').lower().endswith('.pdf'):
        raise HTTPException(400, "O arquivo deve ser um PDF.")
    sb = get_supabase()
    _require_account(sb, user_id, account_id)
    pdf_bytes = await _read_upload(file)
    bank, transactions = parse_pdf(pdf_bytes)
    if bank == 'unknown':
        raise HTTPException(422, "Banco não reconhecido. Suportados: Nubank, Sicredi, Mercado Pago, Will Bank.")
    if not transactions:
        label = BANK_LABELS.get(bank, bank)
        raise HTTPException(422, f"O PDF foi identificado como {label}, mas nenhuma transação pôde ser extraída. Tente exportar novamente pelo app do banco.")
    is_demo = sb.table('demo_users').select('user_id').eq('user_id', user_id).limit(1).execute()
    imported = skipped = 0
    balance_delta = 0.0
    for tx in transactions:
        try:
            desc_norm = normalize_desc(tx['description'])
            tx_date = tx['transaction_date']
            data = {
                'user_id': user_id,
                'account_id': account_id,
                'description': tx['description'],
                'description_normalized': desc_norm,
                'amount': tx['amount'],
                'transaction_date': tx_date,
                'type': tx['type'],
                'sync_status': 'synced',
                'dedup_hash': dedup_hash(account_id, tx_date, tx['amount'], desc_norm),
            }
            result = sb.table('transactions').insert(data).execute()
            txn_id = result.data[0]['id'] if result.data else None
            if txn_id and not is_demo.data:
                sb.table('categorization_queue').insert({'user_id': user_id, 'transaction_id': txn_id, 'status': 'pending'}).execute()
            imported += 1
            balance_delta += tx['amount']
        except Exception as e:
            skipped += 1
            if 'dedup_hash' not in str(e) and 'unique' not in str(e).lower():
                logger.warning("pdf_import_row_failed", error=str(e))
    if imported > 0:
        _adjust_account_balance(sb, user_id, account_id, balance_delta)
    return {'bank': BANK_LABELS.get(bank, bank), 'imported': imported, 'skipped': skipped, 'total': len(transactions)}


@router.post("/import/ofx/parse", tags=["Import"])
@limiter.limit("10/minute")
async def parse_ofx_preview(request: Request, file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    filename = (file.filename or "").lower()
    if not (filename.endswith(".ofx") or filename.endswith(".qfx")):
        raise HTTPException(400, "O arquivo deve ser OFX ou QFX.")
    content = await _read_upload(file)
    transactions = _parse_ofx(content)
    if not transactions:
        raise HTTPException(422, "Nenhuma transação encontrada no arquivo OFX. Verifique o arquivo e tente novamente.")
    return {"transactions": _with_suggestions(transactions, user_id), "total": len(transactions)}
