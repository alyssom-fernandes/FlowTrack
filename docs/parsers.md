# FlowTrack — Statement Parsers

## Supported formats

| Format | Where it is parsed | Banks / variants |
|---|---|---|
| PDF (text) | Backend, `backend/app/integrations/pdf_parser.py` (`parse_pdf`) | Nubank (account statement and card bill), Sicredi (account and card), Mercado Pago (account and card), Will Bank (card) |
| OFX / QFX | Backend, `_parse_ofx` in `backend/app/api/v1/_helpers.py` | Any bank that exports OFX |
| CSV | Browser, `frontend/src/pages/transactions/csv.ts`, with column mapping | Any bank; separator and decimal format detected |

`parse_pdf` first detects the bank and document type from the text (`detect_bank`), then runs the matching
reader. The detected variants are `nubank_extrato`, `nubank_fatura`, `sicredi_extrato`, `sicredi_fatura`,
`mercadopago_extrato`, `mercadopago_fatura` and `will_fatura`. Every import is shown as a preview before it is saved.

## Field Mapping

### Sicredi — Checking Account
- Columns: `Data | Descrição | Documento | Valor (R$) | Saldo (R$)`
- Date format: `DD/MM/AAAA`
- Encoding: UTF-8
- Transaction type embedded in description: `PIX_DEB`, `PIX_CRED`, `TrfCS/CC`

### Nubank — Checking Account
- Structure: blocks per day with sub-items
- Each item: transaction type + full beneficiary name + bank + branch + account
- Date format: `DD MMM AAAA` (e.g. `01 JAN 2026`)
- Encoding: UTF-8

### Nubank — Credit Card
- Sections: purchases by cardholder + payments/financing
- Each line: `DD MMM | description | value`
- Installments: shown with IOF + interest breakdown
- Date format: `DD MMM`

### Will Bank — Credit Card
- Sections: `Compras à vista` + `Parcelamentos`
- Format: `Descrição | Parcela X de Y | Data | Cartão XXXX | Valor`
- Encoding: has known encoding issues — requires text cleanup before parsing

### Mercado Pago — Account
- Columns: `Data | Descrição | ID da operação | Valor | Saldo`
- Date format: `DD-MM-AAAA`
- Special: includes Meli Dólar (crypto) transactions — handled separately

### Mercado Pago — Credit Card
- Known encoding issues (garbled characters) — requires cleanup
- Structure: payment + items per card

## Reader interface

Each PDF reader in `pdf_parser.py` is a function that takes the file bytes and returns a list of dictionaries with
`description`, `amount` (negative for expenses), `transaction_date` (ISO) and `type` (`debit` or `credit`):

```python
def parse_pdf(pdf_bytes: bytes) -> tuple[str, list[dict]]:
    bank = detect_bank(sample)        # first 3 pages; e.g. "nubank_fatura" or "unknown"
    txns = _PARSERS[bank](pdf_bytes)  # one reader per bank and document type
    # duplicates inside the same PDF (date, description, amount) are dropped
```

## Deduplication

Each parsed transaction generates a hash:
```
hash(account_id + date + amount + normalized_description)
```

This hash is stored in the `transactions` table as a `UNIQUE` constraint. Duplicate imports are silently ignored at the database level.
