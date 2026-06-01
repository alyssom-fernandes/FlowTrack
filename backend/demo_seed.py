"""
FlowTrack — Demo Seed Script
Popula o usuário demo@flowtrack.app com dados realistas e persistentes.

Modos:
  python demo_seed.py          → seed completo (primeira execução)
  python demo_seed.py --reset  → reset inteligente: preserva dados seed, remove extras

Lógica do reset inteligente:
  - Contas seed (Nubank, Sicredi Poupança) são preservadas / recriadas
  - Contas extras criadas pelo usuário são removidas
  - Transações seed identificadas por dedup_hash são preservadas / recriadas
  - Transações extras são removidas
  - Metas e investimentos seed (por nome) são preservados / recriados
  - Extras são removidos

Requer backend/.env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
"""

import os
import sys
import hashlib
import re
from datetime import date, datetime, timedelta, timezone
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

# Nomes fixos que identificam dados seed (usados para smart reset)
SEED_ACCOUNT_NAMES   = {"Nubank", "Sicredi Poupança"}
SEED_GOAL_NAMES      = {"Limite de restaurantes", "Reserva de emergência", "Limite de compras online"}
SEED_INVESTMENT_NAMES = {
    "Tesouro IPCA+ 2029", "CDB Nubank 120% CDI",
    "LCI Sicredi", "MXRF11 — Fundo Maxi Renda",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_demo_user_id() -> str:
    try:
        response = sb.auth.admin.list_users()
        users = response if isinstance(response, list) else getattr(response, "users", [])
        for u in users:
            email = getattr(u, "email", None) or (u.get("email") if isinstance(u, dict) else None)
            uid   = getattr(u, "id",    None) or (u.get("id")    if isinstance(u, dict) else None)
            if email == DEMO_EMAIL and uid:
                return uid
    except Exception as e:
        print(f"Erro ao buscar usuário: {e}")
    print(f"ERRO: Usuário {DEMO_EMAIL} não encontrado. Crie-o no Supabase Auth primeiro.")
    sys.exit(1)


def get_categories() -> dict[str, str]:
    """Retorna {nome: id} das categorias padrão."""
    res = sb.table("categories").select("id, name").execute()
    return {c["name"]: c["id"] for c in (res.data or [])}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9\s]", "", s.upper().strip()))[:100]


def dedup_hash(account_id: str, txn_date: str, amount: float, description: str) -> str:
    raw = f"{account_id}|{txn_date}|{amount:.2f}|{norm(description)}"
    return hashlib.sha256(raw.encode()).hexdigest()


def ds(base: date, delta: int) -> str:
    return (base + timedelta(days=delta)).isoformat()


def month_start(months_ago: int) -> date:
    today = date.today()
    m = today.month - months_ago
    y = today.year + (m - 1) // 12
    m = ((m - 1) % 12) + 1
    return date(y, m, 1)


# ── Build seed data ───────────────────────────────────────────────────────────

def build_accounts(user_id: str) -> list[dict]:
    return [
        {
            "user_id": user_id, "name": "Nubank",
            "bank_name": "Nubank", "bank_color": "#820ad1",
            "account_type": "checking", "currency": "BRL", "balance": 3240.50,
        },
        {
            "user_id": user_id, "name": "Sicredi Poupança",
            "bank_name": "Sicredi", "bank_color": "#008000",
            "account_type": "savings", "currency": "BRL", "balance": 15320.00,
        },
    ]


def build_transactions(user_id: str, nub_id: str, sic_id: str, cats: dict[str, str]) -> list[dict]:
    today = date.today()
    m0 = month_start(0)
    m1 = month_start(1)
    m2 = month_start(2)
    m3 = month_start(3)

    def t(account_id, desc, amount, date_str, cat_name=None):
        d_hash = dedup_hash(account_id, date_str, amount, desc)
        return {
            "user_id": user_id, "account_id": account_id,
            "description": desc, "description_normalized": norm(desc),
            "amount": amount, "currency": "BRL",
            "transaction_date": date_str,
            "type": "credit" if amount > 0 else "debit",
            "category_id": cats.get(cat_name) if cat_name else None,
            "categorized_by": "rule" if cat_name else None,
            "confidence_score": 1.0 if cat_name else None,
            "sync_status": "synced",
            "is_recurring": False,
            "dedup_hash": d_hash,
        }

    # Categorias do schema: Alimentação, Transporte, Moradia, Saúde,
    # Educação, Lazer, Vestuário, Assinaturas, Investimentos, Receita,
    # Transferência, Outros
    rows = [
        # ── 3 meses atrás ──────────────────────────────────────────
        t(sic_id, "Salário",                 5500.00, ds(m3, 2),  "Receita"),
        t(nub_id, "Freelance Design",        1800.00, ds(m3, 10), "Receita"),
        t(sic_id, "Aluguel",                -1400.00, ds(m3, 4),  "Moradia"),
        t(sic_id, "Condomínio",              -320.00, ds(m3, 4),  "Moradia"),
        t(nub_id, "Vivo Fibra Internet",      -99.90, ds(m3, 5),  "Assinaturas"),
        t(nub_id, "Netflix",                  -39.90, ds(m3, 10), "Assinaturas"),
        t(nub_id, "Spotify",                  -21.90, ds(m3, 10), "Assinaturas"),
        t(nub_id, "Smart Fit Academia",       -89.90, ds(m3, 5),  "Saúde"),
        t(nub_id, "Supermercado Extra",      -287.40, ds(m3, 7),  "Alimentação"),
        t(nub_id, "Supermercado Pão de Açúcar", -312.80, ds(m3, 20), "Alimentação"),
        t(nub_id, "iFood Restaurante",        -89.50, ds(m3, 12), "Alimentação"),
        t(nub_id, "Restaurante Outback",     -145.00, ds(m3, 22), "Alimentação"),
        t(nub_id, "Uber",                     -34.20, ds(m3, 8),  "Transporte"),
        t(nub_id, "Uber",                     -28.90, ds(m3, 18), "Transporte"),
        t(nub_id, "Posto Shell Combustível", -180.00, ds(m3, 15), "Transporte"),
        t(nub_id, "Farmácia Raia",            -67.30, ds(m3, 14), "Saúde"),
        t(nub_id, "Amazon Compras",          -127.60, ds(m3, 25), "Vestuário"),
        t(nub_id, "Renner Roupas",            -89.00, ds(m3, 17), "Vestuário"),

        # ── 2 meses atrás ──────────────────────────────────────────
        t(sic_id, "Salário",                 5500.00, ds(m2, 2),  "Receita"),
        t(sic_id, "Aluguel",                -1400.00, ds(m2, 4),  "Moradia"),
        t(sic_id, "Condomínio",              -320.00, ds(m2, 4),  "Moradia"),
        t(nub_id, "Vivo Fibra Internet",      -99.90, ds(m2, 5),  "Assinaturas"),
        t(nub_id, "Netflix",                  -39.90, ds(m2, 10), "Assinaturas"),
        t(nub_id, "Spotify",                  -21.90, ds(m2, 10), "Assinaturas"),
        t(nub_id, "Smart Fit Academia",       -89.90, ds(m2, 5),  "Saúde"),
        t(nub_id, "Supermercado Extra",      -198.60, ds(m2, 6),  "Alimentação"),
        t(nub_id, "Supermercado Carrefour",  -267.30, ds(m2, 19), "Alimentação"),
        t(nub_id, "iFood Japonês",            -74.80, ds(m2, 11), "Alimentação"),
        t(nub_id, "Padaria Central",          -32.50, ds(m2, 15), "Alimentação"),
        t(nub_id, "Restaurante Madero",      -118.00, ds(m2, 26), "Alimentação"),
        t(nub_id, "Uber",                     -41.50, ds(m2, 9),  "Transporte"),
        t(nub_id, "Posto BR Combustível",    -175.00, ds(m2, 16), "Transporte"),
        t(nub_id, "Farmácia Drogasil",        -43.20, ds(m2, 13), "Saúde"),
        t(nub_id, "Consulta Médica",         -200.00, ds(m2, 22), "Saúde"),
        t(nub_id, "Steam Jogos",              -59.90, ds(m2, 20), "Lazer"),
        t(nub_id, "Livraria Cultura",         -78.40, ds(m2, 24), "Educação"),

        # ── 1 mês atrás ────────────────────────────────────────────
        t(sic_id, "Salário",                 5500.00, ds(m1, 2),  "Receita"),
        t(nub_id, "Freelance Desenvolvimento", 2400.00, ds(m1, 15), "Receita"),
        t(sic_id, "Aluguel",                -1400.00, ds(m1, 4),  "Moradia"),
        t(sic_id, "Condomínio",              -320.00, ds(m1, 4),  "Moradia"),
        t(nub_id, "Vivo Fibra Internet",      -99.90, ds(m1, 5),  "Assinaturas"),
        t(nub_id, "Netflix",                  -39.90, ds(m1, 10), "Assinaturas"),
        t(nub_id, "Spotify",                  -21.90, ds(m1, 10), "Assinaturas"),
        t(nub_id, "Amazon Prime",             -14.90, ds(m1, 10), "Assinaturas"),
        t(nub_id, "Smart Fit Academia",       -89.90, ds(m1, 5),  "Saúde"),
        t(nub_id, "Supermercado Extra",      -321.70, ds(m1, 8),  "Alimentação"),
        t(nub_id, "Hortifruti",               -89.40, ds(m1, 14), "Alimentação"),
        t(nub_id, "iFood Hamburguer",         -62.50, ds(m1, 12), "Alimentação"),
        t(nub_id, "Restaurante Cosi",        -134.00, ds(m1, 20), "Alimentação"),
        t(nub_id, "Uber",                     -38.70, ds(m1, 7),  "Transporte"),
        t(nub_id, "99 Táxi",                  -22.40, ds(m1, 21), "Transporte"),
        t(nub_id, "Posto Shell Combustível", -185.00, ds(m1, 18), "Transporte"),
        t(nub_id, "Farmácia Raia",            -52.80, ds(m1, 9),  "Saúde"),
        t(nub_id, "Decathlon Esportes",      -167.90, ds(m1, 23), "Saúde"),

        # ── Mês atual (todas no dia 1 para garantir visibilidade) ────
        t(sic_id, "Salário",                 5500.00, ds(m0, 0),  "Receita"),
        t(sic_id, "Aluguel",                -1400.00, ds(m0, 0),  "Moradia"),
        t(sic_id, "Condomínio",              -320.00, ds(m0, 0),  "Moradia"),
        t(nub_id, "Vivo Fibra Internet",      -99.90, ds(m0, 0),  "Assinaturas"),
        t(nub_id, "Netflix",                  -39.90, ds(m0, 0),  "Assinaturas"),
        t(nub_id, "Spotify",                  -21.90, ds(m0, 0),  "Assinaturas"),
        t(nub_id, "Smart Fit Academia",       -89.90, ds(m0, 0),  "Saúde"),
        t(nub_id, "Supermercado Extra",      -278.30, ds(m0, 0),  "Alimentação"),
        t(nub_id, "iFood Pizza",              -79.90, ds(m0, 0),  "Alimentação"),
        t(nub_id, "Uber",                     -31.20, ds(m0, 0),  "Transporte"),
        t(nub_id, "Posto BR Combustível",    -190.00, ds(m0, 0),  "Transporte"),
    ]

    # Filtra transações com datas futuras
    today_str = date.today().isoformat()
    return [r for r in rows if r["transaction_date"] <= today_str]


def build_goals(user_id: str, cats: dict[str, str]) -> list[dict]:
    today = date.today()
    m0 = month_start(0)
    return [
        {
            "user_id": user_id, "name": "Limite de restaurantes",
            "type": "spending_limit", "target_amount": 600.00, "current_amount": 389.50,
            "currency": "BRL", "period": "monthly",
            "start_date": m0.isoformat(), "is_active": True,
            "category_id": cats.get("Alimentação"),
        },
        {
            "user_id": user_id, "name": "Reserva de emergência",
            "type": "savings_target", "target_amount": 20000.00, "current_amount": 15320.00,
            "currency": "BRL", "period": "custom",
            "start_date": date(today.year, 1, 1).isoformat(),
            "end_date": date(today.year, 12, 31).isoformat(),
            "is_active": True,
        },
        {
            "user_id": user_id, "name": "Limite de compras online",
            "type": "spending_limit", "target_amount": 300.00, "current_amount": 127.60,
            "currency": "BRL", "period": "monthly",
            "start_date": m0.isoformat(), "is_active": True,
            "category_id": cats.get("Vestuário"),
        },
    ]


def build_investments(user_id: str) -> list[dict]:
    return [
        {
            "user_id": user_id, "name": "Tesouro IPCA+ 2029",
            "type": "tesouro_direto", "institution": "Tesouro Nacional",
            "total_invested": 5000.00, "current_value": 5347.20,
            "currency": "BRL", "is_active": True,
            "notes": "Vencimento em 2029, indexado ao IPCA",
        },
        {
            "user_id": user_id, "name": "CDB Nubank 120% CDI",
            "type": "cdb", "institution": "Nubank",
            "total_invested": 3000.00, "current_value": 3128.50,
            "currency": "BRL", "is_active": True,
            "notes": "Liquidez diária",
        },
        {
            "user_id": user_id, "name": "LCI Sicredi",
            "type": "lci_lca", "institution": "Sicredi",
            "total_invested": 2000.00, "current_value": 2089.00,
            "currency": "BRL", "is_active": True,
            "notes": "Isento de IR, venc. 12 meses",
        },
        {
            "user_id": user_id, "name": "MXRF11 — Fundo Maxi Renda",
            "type": "fundo_imobiliario", "institution": "XP Investimentos",
            "total_invested": 1500.00, "current_value": 1380.00,
            "currency": "BRL", "is_active": True,
            "notes": "Dividendos mensais",
        },
    ]


# ── Ensure helpers (upsert-style) ─────────────────────────────────────────────

def ensure_accounts(user_id: str) -> tuple[str, str]:
    """Garante que as contas seed existem. Retorna (nub_id, sic_id)."""
    existing = {
        a["name"]: a
        for a in (sb.table("accounts").select("id, name").eq("user_id", user_id).eq("is_active", True).execute().data or [])
    }

    seed_accs = build_accounts(user_id)
    result = {}
    for acc_def in seed_accs:
        name = acc_def["name"]
        if name in existing:
            result[name] = existing[name]["id"]
        else:
            created = sb.table("accounts").insert(acc_def).execute().data[0]
            result[name] = created["id"]
            print(f"  Conta criada: {name}")

    return result["Nubank"], result["Sicredi Poupança"]


def remove_extra_accounts(user_id: str):
    all_accs = sb.table("accounts").select("id, name").eq("user_id", user_id).execute().data or []
    extras = [a for a in all_accs if a["name"] not in SEED_ACCOUNT_NAMES]
    for acc in extras:
        sb.table("accounts").delete().eq("id", acc["id"]).execute()
        print(f"  Conta extra removida: {acc['name']}")
    return len(extras)


def sync_transactions(user_id: str, nub_id: str, sic_id: str, cats: dict[str, str]):
    seed_txns = build_transactions(user_id, nub_id, sic_id, cats)
    seed_hashes = {t["dedup_hash"] for t in seed_txns}

    # Remove extras
    all_txns = sb.table("transactions").select("id, dedup_hash").eq("user_id", user_id).execute().data or []
    extra_ids = [t["id"] for t in all_txns if t.get("dedup_hash") not in seed_hashes]
    removed = 0
    for i in range(0, len(extra_ids), 50):
        sb.table("transactions").delete().in_("id", extra_ids[i:i+50]).execute()
        removed += len(extra_ids[i:i+50])
    if removed:
        print(f"  {removed} transações extras removidas.")

    # Re-insere ausentes
    existing_hashes = {
        t["dedup_hash"]
        for t in (sb.table("transactions").select("dedup_hash").eq("user_id", user_id).execute().data or [])
    }
    missing = [t for t in seed_txns if t["dedup_hash"] not in existing_hashes]
    for i in range(0, len(missing), 20):
        try:
            sb.table("transactions").insert(missing[i:i+20]).execute()
        except Exception as e:
            print(f"  Aviso ao inserir batch: {e}")
    if missing:
        print(f"  {len(missing)} transações seed re-criadas.")

    print(f"  Total seed: {len(seed_txns)} transações.")


def sync_goals(user_id: str, cats: dict[str, str]):
    existing = {
        g["name"]: g
        for g in (sb.table("goals").select("id, name").eq("user_id", user_id).eq("is_active", True).execute().data or [])
    }

    # Remove extras
    extras = [g for name, g in existing.items() if name not in SEED_GOAL_NAMES]
    for g in extras:
        sb.table("goals").delete().eq("id", g["id"]).execute()
        print(f"  Meta extra removida: {g['name']}")

    # Insere ausentes
    for goal_def in build_goals(user_id, cats):
        if goal_def["name"] not in existing:
            sb.table("goals").insert(goal_def).execute()
            print(f"  Meta criada: {goal_def['name']}")


def sync_investments(user_id: str):
    existing = {
        i["name"]: i
        for i in (sb.table("investments").select("id, name").eq("user_id", user_id).eq("is_active", True).execute().data or [])
    }

    # Remove extras
    extras = [i for name, i in existing.items() if name not in SEED_INVESTMENT_NAMES]
    for inv in extras:
        sb.table("investments").delete().eq("id", inv["id"]).execute()
        print(f"  Investimento extra removido: {inv['name']}")

    # Insere ausentes
    for inv_def in build_investments(user_id):
        if inv_def["name"] not in existing:
            sb.table("investments").insert(inv_def).execute()
            print(f"  Investimento criado: {inv_def['name']}")


def record_reset(user_id: str):
    sb.table("demo_users").upsert(
        {"user_id": user_id, "last_reset": datetime.now(timezone.utc).isoformat()},
        on_conflict="user_id",
    ).execute()


# ── Main ──────────────────────────────────────────────────────────────────────

def run(user_id: str, full_wipe: bool = False):
    cats = get_categories()
    if not cats:
        print("AVISO: Nenhuma categoria encontrada. Execute o schema.sql no Supabase primeiro.")

    if full_wipe:
        print("Limpando TODOS os dados do demo user...")
        for table in ["categorization_queue", "transactions", "goals", "investments", "accounts", "merchant_cache"]:
            sb.table(table).delete().eq("user_id", user_id).execute()

    print("Garantindo contas seed...")
    nub_id, sic_id = ensure_accounts(user_id)

    if not full_wipe:
        print("Removendo contas extras...")
        remove_extra_accounts(user_id)

    print("Sincronizando transações...")
    sync_transactions(user_id, nub_id, sic_id, cats)

    print("Sincronizando metas...")
    sync_goals(user_id, cats)

    print("Sincronizando investimentos...")
    sync_investments(user_id)

    record_reset(user_id)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "--seed"
    full_wipe = mode == "--full"

    print(f"FlowTrack Demo Seed [{mode}] — {DEMO_EMAIL}")
    print("=" * 55)

    user_id = get_demo_user_id()
    print(f"Usuário: {user_id[:8]}...")

    run(user_id, full_wipe=full_wipe)

    print("=" * 55)
    if full_wipe:
        print("Seed completo concluído!")
    else:
        print("Reset inteligente concluído! Dados extras removidos, baseline preservado.")
