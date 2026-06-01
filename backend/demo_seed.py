"""
FlowTrack — Demo Seed Script
Popula o usuário demo@flowtrack.app com dados realistas.
Executar: python demo_seed.py

Requer:
  - backend/.env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
  - Usuário demo@flowtrack.app criado no Supabase Auth
"""

import os
import sys
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
DEMO_EMAIL = os.getenv("DEMO_EMAIL", "demo@flowtrack.app")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env")
    sys.exit(1)

sb: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)


def get_demo_user_id() -> str:
    try:
        response = sb.auth.admin.list_users()
        users = response if isinstance(response, list) else getattr(response, "users", [])
        for u in users:
            email = getattr(u, "email", None) or (u.get("email") if isinstance(u, dict) else None)
            uid = getattr(u, "id", None) or (u.get("id") if isinstance(u, dict) else None)
            if email == DEMO_EMAIL and uid:
                return uid
    except Exception as e:
        print(f"Erro ao buscar usuário via admin API: {e}")
    print(f"ERRO: Usuário {DEMO_EMAIL} não encontrado. Crie-o no Supabase Auth primeiro.")
    sys.exit(1)


def clear_user_data(user_id: str):
    print("Limpando dados existentes...")
    for table in ["categorization_queue", "transactions", "goals", "investments", "accounts", "merchant_cache"]:
        sb.table(table).delete().eq("user_id", user_id).execute()


def get_categories() -> dict[str, str]:
    res = sb.table("categories").select("id, name").execute()
    return {c["name"]: c["id"] for c in (res.data or [])}


def seed(user_id: str):
    cats = get_categories()
    if not cats:
        print("AVISO: Nenhuma categoria encontrada. Execute o schema.sql primeiro.")

    def cat(name: str) -> str | None:
        return cats.get(name)

    today = date.today()

    def d(days_ago: int) -> str:
        return (today - timedelta(days=days_ago)).isoformat()

    def month_start(months_ago: int) -> date:
        m = today.month - months_ago
        y = today.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        return date(y, m, 1)

    # ── Accounts ─────────────────────────────────────────────
    print("Criando contas...")
    nubank = sb.table("accounts").insert({
        "user_id": user_id, "name": "Nubank", "bank_name": "Nubank",
        "bank_color": "#820ad1", "account_type": "checking",
        "currency": "BRL", "balance": 3240.50,
    }).execute().data[0]

    sicredi = sb.table("accounts").insert({
        "user_id": user_id, "name": "Sicredi Poupança", "bank_name": "Sicredi",
        "bank_color": "#008000", "account_type": "savings",
        "currency": "BRL", "balance": 15320.00,
    }).execute().data[0]

    nub_id = nubank["id"]
    sic_id = sicredi["id"]

    # ── Transactions ──────────────────────────────────────────
    print("Criando transações...")

    import hashlib, re

    def norm(s: str) -> str:
        return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9\s]', '', s.upper().strip()))[:100]

    def dedup(account_id: str, txn_date: str, amount: float, desc: str) -> str:
        return hashlib.sha256(f"{account_id}|{txn_date}|{amount:.2f}|{norm(desc)}".encode()).hexdigest()

    def txn(account_id, desc, amount, date_str, category_name=None, notes=None):
        d_norm = norm(desc)
        return {
            "user_id": user_id, "account_id": account_id,
            "description": desc, "description_normalized": d_norm,
            "amount": amount, "currency": "BRL",
            "transaction_date": date_str,
            "type": "credit" if amount > 0 else "debit",
            "category_id": cat(category_name) if category_name else None,
            "categorized_by": "rule" if category_name else None,
            "confidence_score": 1.0 if category_name else None,
            "sync_status": "synced",
            "is_recurring": False,
            "notes": notes,
            "dedup_hash": dedup(account_id, date_str, amount, desc),
        }

    m0 = month_start(0)  # current month start
    m1 = month_start(1)  # 1 month ago
    m2 = month_start(2)  # 2 months ago
    m3 = month_start(3)  # 3 months ago

    def ds(base: date, delta: int) -> str:
        return (base + timedelta(days=delta)).isoformat()

    transactions = [
        # ── 3 months ago ─────────────────────────────────────
        txn(sic_id, "Salário",                 5500.00, ds(m3, 2),  "Salário"),
        txn(nub_id, "Freelance Design",        1800.00, ds(m3, 10), "Freelance"),
        txn(sic_id, "Aluguel",                -1400.00, ds(m3, 4),  "Moradia"),
        txn(sic_id, "Condomínio",              -320.00, ds(m3, 4),  "Moradia"),
        txn(nub_id, "Vivo Fibra",               -99.90, ds(m3, 5),  "Tecnologia"),
        txn(nub_id, "Netflix",                  -39.90, ds(m3, 10), "Streaming"),
        txn(nub_id, "Spotify",                  -21.90, ds(m3, 10), "Streaming"),
        txn(nub_id, "Smart Fit",                -89.90, ds(m3, 5),  "Academia"),
        txn(nub_id, "Supermercado Extra",      -287.40, ds(m3, 7),  "Alimentação"),
        txn(nub_id, "Supermercado Pão de Açúcar", -312.80, ds(m3, 20), "Alimentação"),
        txn(nub_id, "iFood Restaurante",        -89.50, ds(m3, 12), "Alimentação"),
        txn(nub_id, "Restaurante Outback",     -145.00, ds(m3, 22), "Alimentação"),
        txn(nub_id, "Uber",                     -34.20, ds(m3, 8),  "Transporte"),
        txn(nub_id, "Uber",                     -28.90, ds(m3, 18), "Transporte"),
        txn(nub_id, "Posto Shell Combustível", -180.00, ds(m3, 15), "Transporte"),
        txn(nub_id, "Farmácia Raia",            -67.30, ds(m3, 14), "Saúde"),
        txn(nub_id, "Amazon Compras",          -127.60, ds(m3, 25), "Compras"),
        txn(nub_id, "Renner Roupas",            -89.00, ds(m3, 17), "Compras"),

        # ── 2 months ago ─────────────────────────────────────
        txn(sic_id, "Salário",                 5500.00, ds(m2, 2),  "Salário"),
        txn(sic_id, "Aluguel",                -1400.00, ds(m2, 4),  "Moradia"),
        txn(sic_id, "Condomínio",              -320.00, ds(m2, 4),  "Moradia"),
        txn(nub_id, "Vivo Fibra",               -99.90, ds(m2, 5),  "Tecnologia"),
        txn(nub_id, "Netflix",                  -39.90, ds(m2, 10), "Streaming"),
        txn(nub_id, "Spotify",                  -21.90, ds(m2, 10), "Streaming"),
        txn(nub_id, "Smart Fit",                -89.90, ds(m2, 5),  "Academia"),
        txn(nub_id, "Supermercado Extra",      -198.60, ds(m2, 6),  "Alimentação"),
        txn(nub_id, "Supermercado Carrefour",  -267.30, ds(m2, 19), "Alimentação"),
        txn(nub_id, "iFood Japonês",            -74.80, ds(m2, 11), "Alimentação"),
        txn(nub_id, "Padaria Central",          -32.50, ds(m2, 15), "Alimentação"),
        txn(nub_id, "Restaurante Madero",      -118.00, ds(m2, 26), "Alimentação"),
        txn(nub_id, "Uber",                     -41.50, ds(m2, 9),  "Transporte"),
        txn(nub_id, "Posto BR Combustível",    -175.00, ds(m2, 16), "Transporte"),
        txn(nub_id, "Farmácia Drogasil",        -43.20, ds(m2, 13), "Saúde"),
        txn(nub_id, "Consulta Médica",         -200.00, ds(m2, 22), "Saúde"),
        txn(nub_id, "Steam Jogos",              -59.90, ds(m2, 20), "Lazer"),
        txn(nub_id, "Livraria Cultura",         -78.40, ds(m2, 24), "Educação"),

        # ── 1 month ago ──────────────────────────────────────
        txn(sic_id, "Salário",                 5500.00, ds(m1, 2),  "Salário"),
        txn(nub_id, "Freelance Desenvolvimento", 2400.00, ds(m1, 15), "Freelance"),
        txn(sic_id, "Aluguel",                -1400.00, ds(m1, 4),  "Moradia"),
        txn(sic_id, "Condomínio",              -320.00, ds(m1, 4),  "Moradia"),
        txn(nub_id, "Vivo Fibra",               -99.90, ds(m1, 5),  "Tecnologia"),
        txn(nub_id, "Netflix",                  -39.90, ds(m1, 10), "Streaming"),
        txn(nub_id, "Spotify",                  -21.90, ds(m1, 10), "Streaming"),
        txn(nub_id, "Amazon Prime",             -14.90, ds(m1, 10), "Streaming"),
        txn(nub_id, "Smart Fit",                -89.90, ds(m1, 5),  "Academia"),
        txn(nub_id, "Supermercado Extra",      -321.70, ds(m1, 8),  "Alimentação"),
        txn(nub_id, "Hortifruti",               -89.40, ds(m1, 14), "Alimentação"),
        txn(nub_id, "iFood Hamburguer",         -62.50, ds(m1, 12), "Alimentação"),
        txn(nub_id, "Restaurante Cosi",        -134.00, ds(m1, 20), "Alimentação"),
        txn(nub_id, "Uber",                     -38.70, ds(m1, 7),  "Transporte"),
        txn(nub_id, "99 Táxi",                  -22.40, ds(m1, 21), "Transporte"),
        txn(nub_id, "Posto Shell Combustível", -185.00, ds(m1, 18), "Transporte"),
        txn(nub_id, "Farmácia Raia",            -52.80, ds(m1, 9),  "Saúde"),
        txn(nub_id, "Decathlon",               -167.90, ds(m1, 23), "Compras"),

        # ── Current month ─────────────────────────────────────
        txn(sic_id, "Salário",                 5500.00, ds(m0, 2),  "Salário"),
        txn(sic_id, "Aluguel",                -1400.00, ds(m0, 4),  "Moradia"),
        txn(sic_id, "Condomínio",              -320.00, ds(m0, 4),  "Moradia"),
        txn(nub_id, "Vivo Fibra",               -99.90, ds(m0, 5),  "Tecnologia"),
        txn(nub_id, "Netflix",                  -39.90, ds(m0, 10), "Streaming"),
        txn(nub_id, "Spotify",                  -21.90, ds(m0, 10), "Streaming"),
        txn(nub_id, "Smart Fit",                -89.90, ds(m0, 5),  "Academia"),
        txn(nub_id, "Supermercado Extra",      -278.30, ds(m0, 7),  "Alimentação"),
        txn(nub_id, "iFood Pizza",              -79.90, ds(m0, 11), "Alimentação"),
        txn(nub_id, "Uber",                     -31.20, ds(m0, 8),  "Transporte"),
        txn(nub_id, "Posto BR Combustível",    -190.00, ds(m0, 12), "Transporte"),
    ]

    # Filter out transactions with dates before DB constraints (if any)
    valid = [t for t in transactions if t["transaction_date"] <= today.isoformat()]

    # Insert in batches of 20 to avoid payload limits
    for i in range(0, len(valid), 20):
        batch = valid[i:i+20]
        try:
            sb.table("transactions").insert(batch).execute()
        except Exception as e:
            print(f"  Aviso ao inserir batch {i//20 + 1}: {e}")

    print(f"  {len(valid)} transações inseridas.")

    # ── Goals ─────────────────────────────────────────────────
    print("Criando metas...")
    goals = [
        {
            "user_id": user_id,
            "name": "Limite de restaurantes",
            "type": "spending_limit",
            "target_amount": 600.00,
            "current_amount": 389.50,
            "currency": "BRL",
            "period": "monthly",
            "start_date": m0.isoformat(),
            "is_active": True,
            "category_id": cat("Alimentação"),
        },
        {
            "user_id": user_id,
            "name": "Reserva de emergência",
            "type": "savings_target",
            "target_amount": 20000.00,
            "current_amount": 15320.00,
            "currency": "BRL",
            "period": "custom",
            "start_date": date(today.year, 1, 1).isoformat(),
            "end_date": date(today.year, 12, 31).isoformat(),
            "is_active": True,
        },
        {
            "user_id": user_id,
            "name": "Limite de compras online",
            "type": "spending_limit",
            "target_amount": 300.00,
            "current_amount": 127.60,
            "currency": "BRL",
            "period": "monthly",
            "start_date": m0.isoformat(),
            "is_active": True,
            "category_id": cat("Compras"),
        },
    ]
    sb.table("goals").insert(goals).execute()
    print(f"  {len(goals)} metas criadas.")

    # ── Investments ────────────────────────────────────────────
    print("Criando investimentos...")
    investments = [
        {
            "user_id": user_id,
            "name": "Tesouro IPCA+ 2029",
            "type": "tesouro_direto",
            "institution": "Tesouro Nacional",
            "total_invested": 5000.00,
            "current_value": 5347.20,
            "currency": "BRL",
            "notes": "Vencimento em 2029, indexado ao IPCA",
            "is_active": True,
        },
        {
            "user_id": user_id,
            "name": "CDB Nubank 120% CDI",
            "type": "cdb",
            "institution": "Nubank",
            "total_invested": 3000.00,
            "current_value": 3128.50,
            "currency": "BRL",
            "notes": "Liquidez diária",
            "is_active": True,
        },
        {
            "user_id": user_id,
            "name": "LCI Sicredi",
            "type": "lci_lca",
            "institution": "Sicredi",
            "total_invested": 2000.00,
            "current_value": 2089.00,
            "currency": "BRL",
            "notes": "Isento de IR, venc. 12 meses",
            "is_active": True,
        },
        {
            "user_id": user_id,
            "name": "MXRF11 — Fundo Maxi Renda",
            "type": "fundo_imobiliario",
            "institution": "XP Investimentos",
            "total_invested": 1500.00,
            "current_value": 1380.00,
            "currency": "BRL",
            "notes": "Dividendos mensais",
            "is_active": True,
        },
    ]
    sb.table("investments").insert(investments).execute()
    print(f"  {len(investments)} investimentos criados.")


if __name__ == "__main__":
    print(f"FlowTrack Demo Seed — {DEMO_EMAIL}")
    print("=" * 50)

    user_id = get_demo_user_id()
    print(f"Usuário demo encontrado: {user_id[:8]}...")

    clear_user_data(user_id)
    seed(user_id)

    print("=" * 50)
    print("Seed concluído com sucesso!")
