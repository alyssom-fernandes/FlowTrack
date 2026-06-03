-- ============================================================
-- FlowTrack — Migrations das Fases A e B do Roadmap
-- Execute no SQL Editor do Supabase (painel do projeto)
-- ============================================================

-- ── N3: Tags livres nas transações ───────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_transactions_tags ON transactions USING gin(tags);


-- ── N1: Orçamento mensal por categoria ───────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users NOT NULL,
  category_id   uuid REFERENCES categories NOT NULL,
  month         text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  limit_amount  numeric(12,2) NOT NULL CHECK (limit_amount > 0),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, category_id, month)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own budgets"
  ON budgets FOR ALL
  USING (auth.uid() = user_id);


-- ── E6: Patrimônio líquido — snapshots mensais ───────────────
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users NOT NULL,
  date              date NOT NULL,
  total_accounts    numeric(14,2) NOT NULL DEFAULT 0,
  total_investments numeric(14,2) NOT NULL DEFAULT 0,
  net_worth         numeric(14,2) NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own net worth snapshots"
  ON net_worth_snapshots FOR ALL
  USING (auth.uid() = user_id);


-- ── E14: Histórico e auditoria de alterações ─────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text NOT NULL,
  action        text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  old_values    jsonb,
  new_values    jsonb,
  undone        boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log (user_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own audit log"
  ON audit_log FOR ALL
  USING (auth.uid() = user_id);


-- ── E2: Cache de insights de IA (opcional — o código usa cache em memória por padrão) ──
-- Se quiser persistir insights entre restarts do backend, crie esta tabela:
-- (Requer ajuste no código Python para usar Supabase ao invés do dict em memória)

-- CREATE TABLE IF NOT EXISTS user_insights (
--   user_id       uuid PRIMARY KEY REFERENCES auth.users,
--   period_start  text NOT NULL,
--   period_end    text NOT NULL,
--   insight_text  text NOT NULL,
--   generated_at  timestamptz DEFAULT now()
-- );
-- ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can manage own insights"
--   ON user_insights FOR ALL
--   USING (auth.uid() = user_id);
