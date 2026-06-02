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

_SKIP = re.compile(
    r'(tem alguma d[úu]vida|extrato gerado|caso a solu|nu financeira|nu pagamentos'
    r'|ouvidoria|0800|cnpj|sac |de 8h|capitais e regi|demais local'
    r'|asseguramos|responsabiliz|autenticidade)',
    re.I,
)


def _amount(s: str) -> Optional[float]:
    s = re.sub(r'[R$\s−–]', '', s).strip()
    s = s.replace('.', '').replace(',', '.')
    try:
        return float(s) if s else None
    except ValueError:
        return None


def _iso(d: str | int, m: str | int, y: str | int) -> str:
    return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"


def _tx(desc: str, amount: float, date: str) -> dict:
    clean = re.sub(r'[•�￾￿]+', '', desc).strip()
    clean = re.sub(r'\s+', ' ', clean)
    return {
        'description': (clean or desc)[:150].strip(),
        'amount': round(amount, 2),
        'transaction_date': date,
        'type': 'credit' if amount >= 0 else 'debit',
    }


# ── Bank detection ────────────────────────────────────────

def detect_bank(text: str) -> str:
    t = text.lower()

    # Nubank extrato has very specific "total de entradas/saídas" + "movimentações"
    # Must check BEFORE sicredi because Nubank extratos contain "sicredi" in Pix descriptions
    if ('total de entradas' in t and 'total de sa' in t and 'movimenta' in t):
        return 'nubank_extrato'

    # Nubank: nu financeira or nu pagamentos
    if 'nu financeira' in t or 'nu pagamentos' in t:
        # Fatura: has billing keywords visible on first pages
        if 'data de vencimento' in t or 'período vigente' in t or 'total a pagar' in t:
            return 'nubank_fatura'
        return 'nubank_extrato'

    if 'sicredi' in t:
        # Extrato: header "Extrato (Período de" and "SALDO ANTERIOR" + "Cooperativa:"
        if re.search(r'extrato.*per[íi]odo', t) or ('cooperativa:' in t and 'saldo anterior' in t):
            return 'sicredi_extrato'
        return 'sicredi_fatura'

    if 'mercado pago' in t:
        if 'detalhe dos movimentos' in t or re.search(r'extrato de conta', t[:400]):
            return 'mercadopago_extrato'
        return 'mercadopago_fatura'

    if 'will financeira' in t or ('will' in t and 'bank' in t and 'fatura' in t):
        return 'will_fatura'

    return 'unknown'


# ── Sicredi Extrato ───────────────────────────────────────
# Table: Data(DD/MM/YYYY) | Descrição | Doc | Valor(±) | Saldo

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


# ── Sicredi Fatura ────────────────────────────────────────
# Text lines: "DD/mmm HH:MM [City] [Presencial|Online] [Desc] [Parcela] R$ X,XX"
# or merged table cells with \n separating sub-lines

def _sicredi_fatura(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        first = pdf.pages[0].extract_text() or ''
        vm = re.search(r'[Vv]encimento\s+(\d{2})/(\d{2})/(\d{4})', first)
        fatura_month = int(vm.group(2)) if vm else 1
        fatura_year  = int(vm.group(3)) if vm else 2026

        for page in pdf.pages:
            lines: list[str] = []
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    for row in table:
                        for cell in row:
                            if cell:
                                lines.extend(str(cell).split('\n'))
            else:
                lines = (page.extract_text() or '').split('\n')

            prev_desc = ''
            for raw in lines:
                line = raw.strip()
                if not line:
                    continue
                lo = line.lower()

                # Match only date/time — NO (.*) so dm.end() stops right after time
                dm = re.match(r'^(\d{2}/([a-záéíóúã]+))\s+\d{2}:\d{2}', lo)
                if not dm:
                    if (len(line) > 4
                            and re.search(r'[a-zA-ZÀ-ú]', line)
                            and not re.match(r'^\d{4}$', line)
                            and not re.match(r'^(data|cid|compra|descri|parcela|valor|legenda|cart|vencimento|total)', lo)):
                        prev_desc = line
                    continue

                day_str    = dm.group(1).split('/')[0]
                month_name = dm.group(2)[:3]
                month_num  = MONTHS_BR.get(month_name)
                if not month_num:
                    continue
                year = fatura_year if month_num <= fatura_month else fatura_year - 1

                # dm.end() is now right after "HH:MM", not end of string
                rest_of_line = line[dm.end():].strip()

                is_neg = bool(re.search(r'[-−]\s*R\$', rest_of_line, re.I))
                am = re.search(r'([-−]?\s*R\$\s*[\d.]+,\d{2})\s*$', rest_of_line, re.I)
                if not am:
                    continue

                amt = _amount(am.group(1))
                if amt is None or amt == 0:
                    continue

                desc_raw = rest_of_line[:am.start()].strip()
                # Remove "City Presencial/Online" prefix
                desc_clean = re.sub(r'^[\w\sÀ-ú]+\s+(presencial|online)\s*', '', desc_raw, flags=re.I).strip()
                # Remove parcela "01/02"
                desc_clean = re.sub(r'\s+\d{2}/\d{2}\s*$', '', desc_clean).strip()
                if not desc_clean:
                    desc_clean = prev_desc or desc_raw or 'Lançamento Sicredi'

                final = abs(amt) if is_neg else -abs(amt)
                txns.append(_tx(desc_clean, final, _iso(day_str, month_num, year)))
                prev_desc = ''

    return txns


# ── Nubank Extrato ────────────────────────────────────────
# Date headers: "DD MMM YYYY Total de entradas/saídas + X,XX"
# Transactions: line ending with amount, or standalone amount after multiline desc

def _nubank_extrato(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        all_lines: list[str] = []
        for page in pdf.pages:
            all_lines.extend((page.extract_text() or '').split('\n'))

    current_date: Optional[str] = None
    is_credit = True
    desc_buf: list[str] = []

    def emit(amt: Optional[float]) -> None:
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
        if _SKIP.search(line):
            emit(None)
            continue

        lo = line.lower()

        # Date at start (without $ anchor) — rest of line may have direction
        dm = re.match(r'^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})(.*)', line, re.I)
        if dm:
            emit(None)
            d, ms, y, rest = dm.groups()
            current_date = _iso(d, MONTHS_UP[ms.upper()], y)
            rest_lo = rest.lower()
            if 'total de entradas' in rest_lo:
                is_credit = True
            elif 'total de sa' in rest_lo:
                is_credit = False
            continue

        if not current_date:
            continue

        # Direction-only line
        if re.match(r'^total de entradas', lo):
            emit(None); is_credit = True; continue
        if re.match(r'^total de sa[íi]das', lo):
            emit(None); is_credit = False; continue

        # Skip account/branch noise
        if re.match(r'^(CPF|CNPJ|Ag[êe]ncia|Conta\s*[\d:–\-]|\d{9,})', line):
            continue

        # Standalone amount: "5.390,08"
        if re.match(r'^[\d.]+,\d{2}$', line):
            amt = _amount(line)
            if amt and amt > 0:
                emit(amt)
            continue

        # Line ending with amount: "Aplicação RDB 3.918,14"
        em = re.search(r'\s+([\d.]+,\d{2})$', line)
        if em:
            desc_part = line[:em.start()].strip()
            amt = _amount(em.group(1))
            if re.match(r'^total de (entradas|sa[íi]das)', desc_part.lower()):
                continue
            if desc_part and amt and amt > 0:
                emit(None)
                final = amt if is_credit else -amt
                txns.append(_tx(desc_part, final, current_date))
            continue

        # Description continuation
        if re.match(r'^(CPF|CNPJ|Ag[êe]ncia|Conta\s*\d)', line):
            continue
        if len(line) > 3 and re.search(r'[a-zA-ZÀ-ú]', line):
            desc_buf.append(line)

    return txns


# ── Nubank Fatura ─────────────────────────────────────────
# Transactions on "TRANSAÇÕES" page: "DD MMM [desc] R$ X,XX"
# Payments:  "DD MMM Pagamento... −R$ X,XX"

def _nubank_fatura(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        full = '\n'.join(p.extract_text() or '' for p in pdf.pages)

    # Year + month from "FATURA 14 ABR 2026"
    fm = re.search(r'FATURA\s+\d+\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})', full, re.I)
    fatura_month = MONTHS_UP.get(fm.group(1).upper(), 1) if fm else 1
    fatura_year  = int(fm.group(2)) if fm else 2026

    idx = full.upper().find('TRANSAÇÕES')
    text = full[idx:] if idx >= 0 else full

    pat = re.compile(
        r'^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)'
        r'\s+(.*?)\s+([-−]?R\$\s*[\d.]+,\d{2})$',
        re.I | re.MULTILINE,
    )
    for m in pat.finditer(text):
        day, mon, desc, val = m.groups()
        month_num = MONTHS_UP.get(mon.upper())
        if not month_num:
            continue
        year = fatura_year if month_num <= fatura_month else fatura_year - 1
        is_neg = '−' in val or val.strip().startswith('-')
        amt = _amount(re.sub(r'[-−R$\s]', '', val))
        if amt is None:
            continue
        desc = desc.strip()
        if not desc:
            continue
        final = amt if is_neg else -amt
        txns.append(_tx(desc, final, _iso(day, month_num, year)))
    return txns


# ── Mercado Pago Extrato ──────────────────────────────────
# Table (ideal): Date(DD-MM-YYYY) | Desc | ID | Value | Balance
# Fallback text: "DD-MM-YYYY [desc] [ID] R$ value R$ balance"

def _mp_extrato(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if table and len(table) > 1 and len((table[1] or [])) >= 4:
                # Table found and looks real
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
                continue

            # Text-based fallback
            text = page.extract_text() or ''
            prev_desc = ''
            last_was_tx = False
            for line in text.split('\n'):
                line = line.strip()
                # "DD-MM-YYYY [desc] [9+ digit ID] R$ value R$ balance"
                m = re.match(r'^(\d{2}-\d{2}-\d{4})\s+(.*?)\s+\d{9,}\s+(R\$\s*-?[\d.,]+)', line)
                if m:
                    date_str, desc_mid, val_str = m.groups()
                    prefix = (prev_desc + ' ') if (prev_desc and not last_was_tx) else ''
                    full_desc = (prefix + desc_mid).strip()
                    d, mo, y = date_str.split('-')
                    amt = _amount(val_str)
                    if amt is not None and full_desc:
                        txns.append(_tx(full_desc, amt, _iso(d, mo, y)))
                    prev_desc = ''
                    last_was_tx = True
                elif re.match(r'^\d{2}-\d{2}-\d{4}', line):
                    prev_desc = ''
                    last_was_tx = True
                elif line and not re.match(r'^(Data|Descri|ID da|Valor|Saldo|Entradas|Saidas|DETALHE|Saldo final|Saldo inicial)', line, re.I):
                    if not last_was_tx:
                        prev_desc = line
                    last_was_tx = False
                else:
                    last_was_tx = False
    return txns


# ── Mercado Pago Fatura ───────────────────────────────────
# Text lines: "DD/MM [description] [Parcela X de Y?] R$ X,XX"

def _mp_fatura(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        first = pdf.pages[0].extract_text() or ''
        vm = re.search(r'[Vv]enc\w*\s*:?\s*(\d{2})/(\d{2})/(\d{4})', first)
        fatura_month = int(vm.group(2)) if vm else 1
        fatura_year  = int(vm.group(3)) if vm else 2026

        for page in pdf.pages:
            text = page.extract_text() or ''
            for line in text.split('\n'):
                line = line.strip()
                # "DD/MM [desc] [Parcela X de Y] R$ X,XX"
                m = re.match(r'^(\d{2}/\d{2})\s+(.+?)\s+R\$\s*([\d.]+,\d{2})$', line)
                if not m:
                    continue
                date_str, desc, amt_str = m.groups()
                day_s, mon_s = date_str.split('/')
                month_num = int(mon_s)
                year = fatura_year if month_num <= fatura_month else fatura_year - 1
                amt = _amount(amt_str)
                if amt is None:
                    continue
                is_payment = 'pagamento' in desc.lower()
                desc = re.sub(r'\s+Parcela\s+\d+\s+de\s+\d+', '', desc, flags=re.I).strip()
                final = amt if is_payment else -amt
                txns.append(_tx(desc, final, _iso(day_s, month_num, year)))
    return txns


# ── Will Bank Fatura ──────────────────────────────────────
# Text lines: "[Desc] DD/MM/YYYY Cartão XXXX [Parcela X de Y] [+]R$ X,XX"

def _will_fatura(data: bytes) -> list[dict]:
    txns = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        full = '\n'.join(p.extract_text() or '' for p in pdf.pages)

    in_txns = False
    for line in full.split('\n'):
        line = line.strip()
        if re.search(r'(Gastos|Compras à vista|Parcelamentos|Lançamentos de)', line, re.I):
            in_txns = True; continue
        if re.search(r'(Recebidos|Os valores em detalhes|Próximas faturas|Tim-tim)', line, re.I):
            in_txns = False; continue
        if not in_txns:
            continue

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


# ── Public API ────────────────────────────────────────────

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
    """Returns (bank_key, transactions). Each tx: {description, amount, transaction_date, type}"""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        sample = '\n'.join((p.extract_text() or '') for p in pdf.pages[:3])

    bank = detect_bank(sample)
    if bank not in _PARSERS:
        return bank, []

    txns = _PARSERS[bank](pdf_bytes)

    # Deduplicate within same PDF
    seen: set[tuple] = set()
    unique: list[dict] = []
    for t in txns:
        key = (t['transaction_date'], t['description'][:40], t['amount'])
        if key not in seen:
            seen.add(key)
            unique.append(t)

    return bank, unique
