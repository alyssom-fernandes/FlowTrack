"""Leitores de PDF (app/integrations/pdf_parser.py) com texto sintético.

Nenhum extrato real entra no repositório: os textos abaixo imitam o layout de cada banco com nomes e
valores inventados. O pdfplumber é trocado por um falso que devolve esse texto (e as tabelas, quando o
leitor usa tabela), então o teste cobre a detecção do banco e as regras de cada leitor, não a extração
de texto do PDF em si.
"""
from unittest.mock import patch

import pytest

from app.integrations import pdf_parser
from app.integrations.pdf_parser import detect_bank, parse_pdf


class FakePage:
    def __init__(self, text: str = "", table=None, tables=None, chars=None):
        self.text, self.table, self.tables, self.chars = text, table, tables or [], chars or []

    def extract_text(self):
        return self.text

    def extract_table(self):
        return self.table

    def extract_tables(self):
        return self.tables


class FakePDF:
    def __init__(self, pages):
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def parse(*pages: FakePage):
    with patch.object(pdf_parser.pdfplumber, "open", lambda _f: FakePDF(list(pages))):
        return parse_pdf(b"%PDF-falso")


def summary(txns):
    return [(t["transaction_date"], t["description"], t["amount"], t["type"]) for t in txns]


# ── Textos sintéticos, um por variante ────────────────────

NUBANK_EXTRATO = """Fulano de Tal
CPF ***.123.456-**
Movimentações
01 OUT 2026 Total de entradas + 5.000,00
Transferência recebida pelo Pix
EMPRESA EXEMPLO LTDA
5.000,00
02 OUT 2026 Total de saídas - 150,90
Compra no débito MERCADO EXEMPLO 120,90
Transferência enviada pelo Pix
FULANO EXEMPLO - SICREDI
30,00
Tem alguma dúvida? Fale com a gente"""

NUBANK_FATURA = """Nu Pagamentos S.A.
FATURA 14 OUT 2026
Data de vencimento: 21 OUT 2026
TRANSAÇÕES
15 SET Mercado Exemplo R$ 89,90
28 DEZ Hotel Exemplo R$ 300,00
02 OUT Pagamento em 02 OUT −R$ 500,00"""

SICREDI_EXTRATO_TEXT = "Sicredi\nCooperativa: 0000\nExtrato\nSALDO ANTERIOR 1.000,00"
SICREDI_EXTRATO_TABLE = [
    ["Data", "Descrição", "Documento", "Valor (R$)", "Saldo (R$)"],
    ["01/10/2026", "SALDO ANTERIOR", "", "", "1.000,00"],
    ["02/10/2026", "PIX_CRED FULANO EXEMPLO", "123", "1.500,00", "2.500,00"],
    ["03/10/2026", "COMPRA CARTAO MERCADO EXEMPLO", "456", "-89,90", "2.410,10"],
]

SICREDI_FATURA = """Sicredi
Fatura do cartão
Vencimento 10/10/2026
05/set 14:32 Cidade Exemplo Presencial MERCADO EXEMPLO R$ 89,90
12/out 09:10 Cidade Exemplo Online STREAMING EXEMPLO 02/03 R$ 50,00
20/dez 18:00 Cidade Exemplo Presencial HOTEL EXEMPLO R$ 300,00
08/out 10:00 PAGAMENTO FATURA -R$ 500,00"""

MP_EXTRATO_TEXT = "Mercado Pago\nDETALHE DOS MOVIMENTOS"
MP_EXTRATO_TABLE = [
    ["Data", "Descrição", "ID da operação", "Valor", "Saldo"],
    ["01-10-2026", "Pagamento recebido Fulano Exemplo", "123456789012", "R$ 200,00", "R$ 1.200,00"],
    ["02-10-2026", "Pagamento Loja Exemplo", "123456789013", "R$ -45,50", "R$ 1.154,50"],
]
MP_EXTRATO_ONLY_TEXT = """Mercado Pago
DETALHE DOS MOVIMENTOS
Data Descrição ID da operação Valor Saldo
Transferência Pix enviada
03-10-2026 FULANO EXEMPLO 123456789014 R$ -30,00 R$ 1.124,50
04-10-2026 Rendimentos 123456789015 R$ 0,12 R$ 1.124,62"""

MP_FATURA = """Mercado Pago
Fatura do cartão
Vencimento: 10/10/2026
15/09 MERCADO EXEMPLO R$ 89,90
20/09 LOJA EXEMPLO Parcela 2 de 3 R$ 100,00
20/12 HOTEL EXEMPLO R$ 300,00
05/10 Pagamento da fatura R$ 500,00"""

WILL_FATURA = """Will Financeira
Fatura
Compras à vista
MERCADO EXEMPLO 15/09/2026 Cartão 1234 R$ 89,90
LOJA EXEMPLO 20/09/2026 Cartão 1234 Parcela 2 de 3 R$ 100,00
Pagamento da fatura 05/10/2026 Cartão 1234 +R$ 500,00
Próximas faturas
OUTRA LOJA 01/11/2026 Cartão 1234 R$ 50,00"""


class TestDetectBank:
    @pytest.mark.parametrize("text, bank", [
        (NUBANK_EXTRATO, "nubank_extrato"),
        (NUBANK_FATURA, "nubank_fatura"),
        (SICREDI_EXTRATO_TEXT, "sicredi_extrato"),
        ("Sicredi\nExtrato (Período de 01/10/2026 a 31/10/2026)", "sicredi_extrato"),
        (SICREDI_FATURA, "sicredi_fatura"),
        (MP_EXTRATO_TEXT, "mercadopago_extrato"),
        ("Mercado Pago\nExtrato de conta\nPeríodo", "mercadopago_extrato"),
        (MP_FATURA, "mercadopago_fatura"),
        (WILL_FATURA, "will_fatura"),
        ("Will Bank\nFatura do cartão", "will_fatura"),
        ("Nu Pagamentos S.A.\nconta", "nubank_extrato"),
        ("Banco Exemplo\nExtrato", "unknown"),
        ("", "unknown"),
    ])
    def test_variants(self, text, bank):
        assert detect_bank(text) == bank

    def test_nubank_statement_wins_over_sicredi_in_a_pix_description(self):
        assert "SICREDI" in NUBANK_EXTRATO
        assert detect_bank(NUBANK_EXTRATO) == "nubank_extrato"


class TestReaders:
    def test_nubank_extrato(self):
        bank, txns = parse(FakePage(NUBANK_EXTRATO))
        assert bank == "nubank_extrato"
        assert summary(txns) == [
            ("2026-10-01", "Transferência recebida pelo Pix EMPRESA EXEMPLO LTDA", 5000.0, "credit"),
            ("2026-10-02", "Compra no débito MERCADO EXEMPLO", -120.9, "debit"),
            ("2026-10-02", "Transferência enviada pelo Pix FULANO EXEMPLO - SICREDI", -30.0, "debit"),
        ]

    def test_nubank_fatura_signs_and_year_rollover(self):
        bank, txns = parse(FakePage(NUBANK_FATURA))
        assert bank == "nubank_fatura"
        assert summary(txns) == [
            ("2026-09-15", "Mercado Exemplo", -89.9, "debit"),
            # Dezembro numa fatura de outubro é do ano anterior
            ("2025-12-28", "Hotel Exemplo", -300.0, "debit"),
            # Pagamento com "−R$" entra como crédito
            ("2026-10-02", "Pagamento em 02 OUT", 500.0, "credit"),
        ]

    def test_sicredi_extrato_from_table(self):
        bank, txns = parse(FakePage(SICREDI_EXTRATO_TEXT, table=SICREDI_EXTRATO_TABLE))
        assert bank == "sicredi_extrato"
        # Cabeçalho e SALDO ANTERIOR ficam de fora
        assert summary(txns) == [
            ("2026-10-02", "PIX_CRED FULANO EXEMPLO", 1500.0, "credit"),
            ("2026-10-03", "COMPRA CARTAO MERCADO EXEMPLO", -89.9, "debit"),
        ]

    def test_sicredi_fatura(self):
        bank, txns = parse(FakePage(SICREDI_FATURA))
        assert bank == "sicredi_fatura"
        assert summary(txns) == [
            ("2026-09-05", "MERCADO EXEMPLO", -89.9, "debit"),
            # Cidade, "Online" e o número da parcela saem da descrição
            ("2026-10-12", "STREAMING EXEMPLO", -50.0, "debit"),
            ("2025-12-20", "HOTEL EXEMPLO", -300.0, "debit"),
            ("2026-10-08", "PAGAMENTO FATURA", 500.0, "credit"),
        ]

    def test_mercadopago_extrato_from_table(self):
        bank, txns = parse(FakePage(MP_EXTRATO_TEXT, table=MP_EXTRATO_TABLE))
        assert bank == "mercadopago_extrato"
        assert summary(txns) == [
            ("2026-10-01", "Pagamento recebido Fulano Exemplo", 200.0, "credit"),
            ("2026-10-02", "Pagamento Loja Exemplo", -45.5, "debit"),
        ]

    def test_mercadopago_extrato_text_fallback_joins_the_line_above(self):
        bank, txns = parse(FakePage(MP_EXTRATO_ONLY_TEXT))
        assert bank == "mercadopago_extrato"
        assert summary(txns) == [
            ("2026-10-03", "Transferência Pix enviada FULANO EXEMPLO", -30.0, "debit"),
            ("2026-10-04", "Rendimentos", 0.12, "credit"),
        ]

    def test_mercadopago_fatura(self):
        bank, txns = parse(FakePage(MP_FATURA))
        assert bank == "mercadopago_fatura"
        assert summary(txns) == [
            ("2026-09-15", "MERCADO EXEMPLO", -89.9, "debit"),
            ("2026-09-20", "LOJA EXEMPLO", -100.0, "debit"),
            ("2025-12-20", "HOTEL EXEMPLO", -300.0, "debit"),
            ("2026-10-05", "Pagamento da fatura", 500.0, "credit"),
        ]

    def test_will_fatura_reads_only_the_purchase_sections(self):
        bank, txns = parse(FakePage(WILL_FATURA))
        assert bank == "will_fatura"
        assert summary(txns) == [
            ("2026-09-15", "MERCADO EXEMPLO", -89.9, "debit"),
            ("2026-09-20", "LOJA EXEMPLO", -100.0, "debit"),
            ("2026-10-05", "Pagamento da fatura", 500.0, "credit"),
        ]

    def test_unknown_bank_returns_nothing(self):
        assert parse(FakePage("Banco Exemplo\n01/10/2026 COMPRA R$ 10,00")) == ("unknown", [])

    def test_duplicates_inside_the_same_pdf_are_dropped(self):
        repeated = MP_FATURA + "\n15/09 MERCADO EXEMPLO R$ 89,90"
        _, txns = parse(FakePage(repeated))
        assert [t["description"] for t in txns].count("MERCADO EXEMPLO") == 1

    def test_pages_are_read_in_order(self):
        first, second = NUBANK_FATURA, "05 OUT Farmácia Exemplo R$ 25,00"
        _, txns = parse(FakePage(first), FakePage(second))
        assert txns[-1]["description"] == "Farmácia Exemplo" and txns[-1]["amount"] == -25.0


# ── Correção da fonte AYALFN+ (faturas do Mercado Pago) ───

def chars(line: str, top: float, font: str) -> list[dict]:
    """Um caractere por posição; espaço vira um vão maior que 3 pt, como no PDF."""
    out, x = [], 0.0
    for ch in line:
        if ch == " ":
            x += 6
            continue
        out.append({"text": ch, "x0": x, "x1": x + 4, "top": top, "fontname": font})
        x += 5
    return out


class TestFontFix:
    def test_ayalfn_characters_are_translated(self):
        # Na fonte com o mapa errado, "R" sai como "$", "$" como "4", "4" como "M", "9" como "%" e "M" como "z"
        page = FakePage(chars=chars("15/0% zE$CADO $4 M%,%0", 100, "ABCDEF+AYALFN"))
        assert pdf_parser._extract_with_font_fix(page) == "15/09 MERCADO R$ 49,90"

    def test_other_fonts_are_kept(self):
        page = FakePage(chars=chars("15/09 MERCADO R$ 49,90", 100, "Helvetica"))
        assert pdf_parser._extract_with_font_fix(page) == "15/09 MERCADO R$ 49,90"

    def test_lines_follow_the_vertical_position(self):
        page = FakePage(chars=chars("SEGUNDA", 120, "Helvetica") + chars("PRIMEIRA", 100, "Helvetica"))
        assert pdf_parser._extract_with_font_fix(page) == "PRIMEIRA\nSEGUNDA"

    def test_without_chars_falls_back_to_text(self):
        assert pdf_parser._extract_with_font_fix(FakePage("texto simples")) == "texto simples"
