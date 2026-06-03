-- ============================================================
-- FlowTrack — Migrations da Fase A do Roadmap
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
