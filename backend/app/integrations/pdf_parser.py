"""
PDF statement parser for Brazilian banks.
Supported: Nubank (extrato/fatura), Sicredi (extrato/fatura),
           Mercado Pago (extrato/fatura), Will Bank (fatura).
"""
import re
import io
from typing import Optional
import pdfplumber

MONTHS_BR: dict[str, int] = {
    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12,
}
MONTHS_UP: dict[str, int] = {k.upper(): v for k, v in MONTHS_BR.items()}

_SKIP_LINES = re.compile(
    r'(tem alguma d[úu]vida|extrato gerado|caso a solu|nu financeira|nu pagamentos'
    r'|ouvidoria|atendimento|0800|cnpj|sac |de 8h|capitais e regi|demais local'
    r'|asseguramos|responsabiliz|autenticidade)',
    re.I,
)


def _amount(s: str) -> Optional[float]:
    """'R$ 1.234,56' / '-1.234,56' / '1234,56' → float | None"""
    s = re.sub(r'[R$\s−–]', '', s).strip()
    s = s.replace('.', '').replace(',', '.')
    try:
        return float(s) if s else None
    except ValueError:
        return None


def _iso(d: str | int, m: str | int, y: str | int) -> str:
    return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"


# ── Bank detection ────────────────────────────────────────

def detect_bank(text: str) -> str:
    t = text.lower()
    if 'nu financeira' in t or 'nu pagamentos' in t:
        if 'transações' in t and 'fatura' in t[:600]:
            return 'nubank_fatura'
        return 'nubank_extrato'
    if 'sicredi' in t:
        if 'cooperativa' in t and 'saldo anterior' in t:
            return 'sicredi_extrato'
        return 'sicredi_fatura'
    if 'mercado pago' in t:
        if 'detalhe dos movimentos' in t or ('extrato de conta' in t and 'movimentos' in t):
            return 'mercadopago_extrato'
        return 'mercadopago_fatura'
    if 'will financeira' in t or ('will' in t and 'bank' in t and 'fatura' in t):
        return 'will_fatura'
    return 'unknown'


# ── Sicredi Extrato (Sicredi2) ────────────────────────────
# Clean table: Date(DD/MM/YYYY) | Description | Doc | Value(±) | Balance

def _sicredi_extrato(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue
            for row in table:
                if not row or len(row) < 4:
                    continue
                date_c = (row[0] or '').strip()
                desc_c = (row[1] or '').strip()
                val_c  = (row[3] or '').strip()
                if not re.match(r'\d{2}/\d{2}/\d{4}', date_c):
                    continue
                if not desc_c or 'saldo anterior' in desc_c.lower():
                    continue
                amt = _amount(val_c)
                if amt is None:
                    continue
                d, m, y = date_c.split('/')
                txns.append(_tx(desc_c, amt, _iso(d, m, y)))
    return txns


# ── Mercado Pago Extrato (MercadoPago1) ───────────────────
# Table: Date(DD-MM-YYYY) | Description | ID | Value | Balance

def _mp_extrato(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue
            for row in table:
                if not row or len(row) < 4:
                    continue
                date_c = (row[0] or '').strip()
                desc_c = (row[1] or '').strip()
                val_c  = (row[3] or '').strip()
                if not re.match(r'\d{2}-\d{2}-\d{4}', date_c):
                    continue
                amt = _amount(val_c)
                if amt is None:
                    continue
                d, m, y = date_c.split('-')
                txns.append(_tx(desc_c, amt, _iso(d, m, y)))
    return txns


# ── Sicredi Fatura (Sicredi1) ─────────────────────────────
# Table rows: Date(DD/mmm HH:MM) | City | Type | Description | Parcela | ... | Value

def _sicredi_fatura(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        # Get fatura close date for year inference: "Vencimento 10/01/2026"
        first = pdf.pages[0].extract_text() or ''
        vm = re.search(r'[Vv]encimento\s+(\d{2})/(\d{2})/(\d{4})', first)
        fatura_month = int(vm.group(2)) if vm else 1
        fatura_year  = int(vm.group(3)) if vm else 2026

        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row:
                        continue
                    date_c = (row[0] or '').strip()
                    dm = re.match(r'(\d{2})/([a-záéíóúã]+)', date_c.lower())
                    if not dm:
                        continue
                    day = int(dm.group(1))
                    month_name = dm.group(2)[:3]
                    month_num = MONTHS_BR.get(month_name)
                    if not month_num:
                        continue
                    year = fatura_year if month_num <= fatura_month else fatura_year - 1

                    # Description is the last non-empty text column before the value column
                    # Value is usually the last cell
                    val_c = ''
                    desc_c = ''
                    for i in range(len(row) - 1, -1, -1):
                        cell = (row[i] or '').strip()
                        if not cell:
                            continue
                        if not val_c and re.search(r'[\d.]+,\d{2}', cell):
                            val_c = cell
                            continue
                        if not desc_c and re.search(r'[a-zA-Z]', cell) and len(cell) > 2:
                            desc_c = cell
                            break

                    if not val_c or not desc_c:
                        continue

                    is_neg = '-' in val_c or '−' in val_c
                    amt = _amount(re.sub(r'[-−R$\s]', '', val_c))
                    if amt is None or amt == 0:
                        continue

                    # Credit card: purchases = debit (negative), payments/credits = positive
                    final_amt = amt if is_neg else -amt
                    txns.append(_tx(desc_c, final_amt, _iso(day, month_num, year)))
    return txns


# ── Nubank Extrato (Nubank1) ──────────────────────────────
# Complex text layout: date headers, "Total de entradas/saídas" groups,
# simple lines end with amount, Pix transfers have amount on own line.

def _nubank_extrato(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        all_lines: list[str] = []
        for page in pdf.pages:
            all_lines.extend((page.extract_text() or '').split('\n'))

    current_date: Optional[str] = None
    is_credit = True
    desc_buf: list[str] = []

    def flush(amt: Optional[float]) -> None:
        nonlocal desc_buf
        if desc_buf and amt and current_date:
            desc = ' '.join(desc_buf)[:150]
            final = amt if is_credit else -amt
            txns.append(_tx(desc, final, current_date))
        desc_buf = []

    for raw in all_lines:
        line = raw.strip()
        if not line:
            continue
        if _SKIP_LINES.search(line):
            flush(None)
            continue

        lo = line.lower()

        # Date header "01 JAN 2026"
        dm = re.match(r'^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})$', line, re.I)
        if dm:
            flush(None)
            d, ms, y = dm.groups()
            current_date = _iso(d, MONTHS_UP[ms.upper()], y)
            continue

        if not current_date:
            continue

        # Direction lines
        if re.match(r'^total de entradas', lo):
            flush(None)
            is_credit = True
            continue
        if re.match(r'^total de sa[íi]das', lo):
            flush(None)
            is_credit = False
            continue

        # Standalone amount: "5.390,08"
        if re.match(r'^[\d.]+,\d{2}$', line):
            amt = _amount(line)
            if amt and amt > 0:
                flush(amt)
            continue

        # Line ending with amount: "Aplicação RDB 3.918,14"
        em = re.search(r'\s+([\d.]+,\d{2})$', line)
        if em:
            desc_part = line[:em.start()].strip()
            amt = _amount(em.group(1))
            # Skip summary lines
            if re.match(r'^total de (entradas|sa[íi]das)', desc_part.lower()):
                continue
            flush(None)
            if desc_part and amt and amt > 0:
                final = amt if is_credit else -amt
                txns.append(_tx(desc_part, final, current_date))
            continue

        # Possible description line (text without amount)
        # Skip lines that look like account/branch info
        if re.match(r'^(CPF|Ag[eê]ncia|Conta\s*[\d:–]|CNPJ|\d{4,})', line):
            continue
        if len(line) > 3 and re.search(r'[a-zA-ZÀ-ú]', line):
            desc_buf.append(line)

    return txns


# ── Nubank Fatura (Nubank2) ───────────────────────────────
# Transactions: "DD MMM [desc] R$ X,XX"  or  "DD MMM [desc] −R$ X,XX"

def _nubank_fatura(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        full = '\n'.join(p.extract_text() or '' for p in pdf.pages)

    # Year from "FATURA 14 ABR 2026"
    ym = re.search(r'FATURA\s+\d+\s+\w+\s+(\d{4})', full, re.I)
    year = int(ym.group(1)) if ym else 2026

    # Find transaction section
    idx = full.upper().find('TRANSAÇÕES')
    text = full[idx:] if idx >= 0 else full

    pattern = re.compile(
        r'^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)'
        r'\s+(.*?)\s+([-−]?R\$\s*[\d.]+,\d{2})$',
        re.I | re.MULTILINE,
    )
    for m in pattern.finditer(text):
        day, mon, desc, val = m.groups()
        month_num = MONTHS_UP.get(mon.upper())
        if not month_num:
            continue
        is_neg = '−' in val or val.strip().startswith('-')
        amt = _amount(re.sub(r'[-−R$\s]', '', val))
        if amt is None:
            continue
        desc = desc.strip()
        if not desc:
            continue
        final = amt if is_neg else -amt   # purchases → debit
        txns.append(_tx(desc, final, _iso(day, month_num, year)))
    return txns


# ── Mercado Pago Fatura (MercadoPago2) ────────────────────
# Table: Date(DD/MM) | Description | Parcela | Value

def _mp_fatura(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        first = pdf.pages[0].extract_text() or ''
        # "Vencimento: 14/01/2026"
        vm = re.search(r'[Vv]enc\w*\s*:?\s*(\d{2})/(\d{2})/(\d{4})', first)
        fatura_month = int(vm.group(2)) if vm else 1
        fatura_year  = int(vm.group(3)) if vm else 2026

        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row or len(row) < 3:
                        continue
                    date_c = (row[0] or '').strip()
                    desc_c = (row[1] or '').strip()
                    val_c  = (row[-1] or '').strip()
                    if not re.match(r'^\d{2}/\d{2}$', date_c):
                        continue
                    day_s, mon_s = date_c.split('/')
                    month_num = int(mon_s)
                    year = fatura_year if month_num <= fatura_month else fatura_year - 1
                    amt = _amount(val_c)
                    if amt is None or amt == 0:
                        continue
                    is_payment = 'pagamento' in desc_c.lower()
                    final = amt if is_payment else -amt
                    if desc_c:
                        txns.append(_tx(desc_c, final, _iso(day_s, month_num, year)))
    return txns


# ── Will Bank Fatura (Will1) ──────────────────────────────
# Lines: "[Desc] DD/MM/YYYY Cartão XXXX [Parcela X de Y] [+]R$ X,XX"

def _will_fatura(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        full = '\n'.join(p.extract_text() or '' for p in pdf.pages)

    in_txns = False
    for line in full.split('\n'):
        line = line.strip()
        if re.search(r'(Gastos|Compras à vista|Parcelamentos|Lançamentos de)', line, re.I):
            in_txns = True
            continue
        if re.search(r'(Recebidos|Os valores em detalhes|Próximas faturas|Tim-tim)', line, re.I):
            in_txns = False
            continue
        if not in_txns:
            continue

        # Pattern: [desc] DD/MM/YYYY Cartão XXXX [Parcela X de Y] [+]R$ X,XX
        m = re.search(
            r'(\d{2}/\d{2}/\d{4})\s+Cart[aã]o\s+\d+\s*(?:Parcela\s+\d+\s+de\s+\d+\s*)?'
            r'(\+?)R\$\s*([\d.]+,\d{2})$',
            line, re.I,
        )
        if not m:
            continue
        date_str, plus_flag, amt_str = m.groups()
        desc = line[:m.start()].strip()
        if not desc:
            continue
        d, mo, y = date_str.split('/')
        amt = _amount(amt_str)
        if amt is None:
            continue
        is_payment = bool(plus_flag) or re.search(r'pag.*(fatura|saldo)', desc, re.I) is not None
        final = amt if is_payment else -amt
        txns.append(_tx(desc, final, _iso(d, mo, y)))
    return txns


# ── Helpers ───────────────────────────────────────────────

def _tx(desc: str, amount: float, date: str) -> dict:
    return {
        'description': desc[:150].strip(),
        'amount': round(amount, 2),
        'transaction_date': date,
        'type': 'credit' if amount >= 0 else 'debit',
    }


_PARSERS = {
    'nubank_extrato':      _nubank_extrato,
    'nubank_fatura':       _nubank_fatura,
    'sicredi_extrato':     _sicredi_extrato,
    'sicredi_fatura':      _sicredi_fatura,
    'mercadopago_extrato': _mp_extrato,
    'mercadopago_fatura':  _mp_fatura,
    'will_fatura':         _will_fatura,
}

BANK_LABELS = {
    'nubank_extrato':      'Nubank — Extrato',
    'nubank_fatura':       'Nubank — Fatura',
    'sicredi_extrato':     'Sicredi — Extrato',
    'sicredi_fatura':      'Sicredi — Fatura',
    'mercadopago_extrato': 'Mercado Pago — Extrato',
    'mercadopago_fatura':  'Mercado Pago — Fatura',
    'will_fatura':         'Will Bank — Fatura',
    'unknown':             'Banco não reconhecido',
}


def parse_pdf(pdf_bytes: bytes) -> tuple[str, list[dict]]:
    """
    Returns (bank_key, transactions).
    Each transaction: {description, amount, transaction_date, type}
    """
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        sample = '\n'.join((p.extract_text() or '') for p in pdf.pages[:3])

    bank = detect_bank(sample)
    if bank not in _PARSERS:
        return bank, []

    txns = _PARSERS[bank](pdf_bytes)

    # Deduplicate within the same PDF
    seen: set[tuple] = set()
    unique: list[dict] = []
    for t in txns:
        key = (t['transaction_date'], t['description'][:40], t['amount'])
        if key not in seen:
            seen.add(key)
            unique.append(t)

    return bank, unique
