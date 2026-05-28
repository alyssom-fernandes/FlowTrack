# FlowTrack — Statement Parsers

## Supported Formats (Phase 1)

| Parser | Bank | Format | Type |
|---|---|---|---|
| `sicredi_account` | Sicredi | PDF (text) | Checking account |
| `nubank_account` | Nubank | CSV | Checking account |
| `nubank_card` | Nubank | PDF (text) | Credit card statement |
| `willbank_card` | Will Bank | PDF (text) | Credit card statement |
| `mercadopago_account` | Mercado Pago | PDF (text) | Account statement |
| `mercadopago_card` | Mercado Pago | PDF (text) | Credit card statement |

> PDF parsing is Phase 2. Phase 1 supports OFX and CSV formats only.

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

## Parser Interface

All parsers implement the base interface defined in `backend/app/parsers/base.py`:

```python
class BaseParser:
    parser_version: str
    
    def parse(self, file_content: str) -> list[ParsedTransaction]:
        raise NotImplementedError
    
    def validate(self, file_content: str) -> bool:
        raise NotImplementedError
```

## Deduplication

Each parsed transaction generates a hash:
```
hash(account_id + date + amount + normalized_description)
```

This hash is stored in the `transactions` table as a `UNIQUE` constraint. Duplicate imports are silently ignored at the database level.
