-- ============================================================
-- FlowTrack — Seed de dados demo
-- Execute no Supabase SQL Editor após criar a conta demo.
-- A conta demo deve existir em auth.users com o e-mail abaixo.
-- ============================================================

DO $$
DECLARE
  uid          uuid;
  acc_nubank   uuid;
  acc_sicredi  uuid;
  acc_itau     uuid;
  cat_alim     uuid;
  cat_transp   uuid;
  cat_moradia  uuid;
  cat_saude    uuid;
  cat_lazer    uuid;
  cat_assin    uuid;
  cat_receita  uuid;
  cat_outros   uuid;
BEGIN

  -- ── Buscar usuário demo ────────────────────────────────────
  SELECT id INTO uid FROM auth.users WHERE email = 'demo@flowtrack.app' LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Usuário demo não encontrado. Crie a conta demo primeiro.';
  END IF;

  -- ── Limpar dados existentes da demo ───────────────────────
  DELETE FROM investments  WHERE user_id = uid;
  DELETE FROM goals        WHERE user_id = uid;
  DELETE FROM transactions WHERE user_id = uid;
  DELETE FROM accounts     WHERE user_id = uid;

  -- ── Buscar IDs das categorias padrão ──────────────────────
  SELECT id INTO cat_alim    FROM categories WHERE name = 'Alimentação'  AND is_default = true LIMIT 1;
  SELECT id INTO cat_transp  FROM categories WHERE name = 'Transporte'   AND is_default = true LIMIT 1;
  SELECT id INTO cat_moradia FROM categories WHERE name = 'Moradia'      AND is_default = true LIMIT 1;
  SELECT id INTO cat_saude   FROM categories WHERE name = 'Saúde'        AND is_default = true LIMIT 1;
  SELECT id INTO cat_lazer   FROM categories WHERE name = 'Lazer'        AND is_default = true LIMIT 1;
  SELECT id INTO cat_assin   FROM categories WHERE name = 'Assinaturas'  AND is_default = true LIMIT 1;
  SELECT id INTO cat_receita FROM categories WHERE name = 'Receita'      AND is_default = true LIMIT 1;
  SELECT id INTO cat_outros  FROM categories WHERE name = 'Outros'       AND is_default = true LIMIT 1;

  -- ── Contas ────────────────────────────────────────────────
  INSERT INTO accounts (id, user_id, name, bank_name, bank_color, account_type, currency, balance, is_active)
  VALUES (uuid_generate_v4(), uid, 'Conta Corrente', 'Nubank', '#820ad1', 'checking', 'BRL', 3247.80, true)
  RETURNING id INTO acc_nubank;

  INSERT INTO accounts (id, user_id, name, bank_name, bank_color, account_type, currency, balance, is_active)
  VALUES (uuid_generate_v4(), uid, 'Poupança', 'Sicredi', '#008000', 'savings', 'BRL', 12450.00, true)
  RETURNING id INTO acc_sicredi;

  INSERT INTO accounts (id, user_id, name, bank_name, bank_color, account_type, currency, balance, is_active)
  VALUES (uuid_generate_v4(), uid, 'Cartão de Crédito', 'Itaú', '#EC7000', 'credit', 'BRL', -847.50, true)
  RETURNING id INTO acc_itau;

  -- ── Transações — Maio 2026 ────────────────────────────────
  -- Receitas
  INSERT INTO transactions (user_id, account_id, category_id, description, amount, transaction_date, type, sync_status, categorized_by)
  VALUES
    (uid, acc_nubank, cat_receita, 'Salário', 5500.00, '2026-05-05', 'credit', 'synced', 'manual'),
    (uid, acc_nubank, cat_receita, 'Freelance Design', 800.00, '2026-05-12', 'credit', 'synced', 'manual');

  -- Despesas
  INSERT INTO transactions (user_id, account_id, category_id, description, amount, transaction_date, type, sync_status, categorized_by)
  VALUES
    (uid, acc_nubank,  cat_moradia, 'Aluguel',               -1200.00, '2026-05-02', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_alim,    'Supermercado Extra',     -342.50,  '2026-05-03', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_transp,  'Gasolina Ipiranga',      -195.00,  '2026-05-06', 'debit', 'synced', 'rule'),
    (uid, acc_itau,    cat_alim,    'iFood',                  -89.90,   '2026-05-08', 'debit', 'synced', 'ai'),
    (uid, acc_itau,    cat_assin,   'Netflix',                -44.90,   '2026-05-10', 'debit', 'synced', 'rule'),
    (uid, acc_itau,    cat_assin,   'Spotify',                -21.90,   '2026-05-10', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_outros,  'Conta de Luz',           -127.80,  '2026-05-12', 'debit', 'synced', 'manual'),
    (uid, acc_nubank,  cat_saude,   'Farmácia Drogasil',      -67.40,   '2026-05-14', 'debit', 'synced', 'ai'),
    (uid, acc_itau,    cat_lazer,   'Cinema Cinemark',        -68.00,   '2026-05-17', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_alim,    'Restaurante Outback',    -156.00,  '2026-05-18', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_saude,   'Academia SmartFit',      -99.90,   '2026-05-20', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_transp,  'Uber',                   -34.50,   '2026-05-21', 'debit', 'synced', 'ai'),
    (uid, acc_itau,    cat_alim,    'Padaria São João',       -28.50,   '2026-05-22', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_outros,  'Conta de Água',          -58.20,   '2026-05-24', 'debit', 'synced', 'manual'),
    (uid, acc_itau,    cat_alim,    'iFood',                  -54.90,   '2026-05-25', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_transp,  'Gasolina Ipiranga',      -180.00,  '2026-05-27', 'debit', 'synced', 'rule');

  -- ── Transações — Abril 2026 ───────────────────────────────
  INSERT INTO transactions (user_id, account_id, category_id, description, amount, transaction_date, type, sync_status, categorized_by)
  VALUES
    (uid, acc_nubank, cat_receita, 'Salário', 5500.00, '2026-04-05', 'credit', 'synced', 'manual'),
    (uid, acc_nubank,  cat_moradia, 'Aluguel',               -1200.00, '2026-04-02', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_alim,    'Supermercado Extra',     -298.70,  '2026-04-04', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_transp,  'Gasolina Ipiranga',      -175.00,  '2026-04-07', 'debit', 'synced', 'rule'),
    (uid, acc_itau,    cat_alim,    'iFood',                  -112.40,  '2026-04-09', 'debit', 'synced', 'ai'),
    (uid, acc_itau,    cat_assin,   'Netflix',                -44.90,   '2026-04-10', 'debit', 'synced', 'rule'),
    (uid, acc_itau,    cat_assin,   'Spotify',                -21.90,   '2026-04-10', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_outros,  'Conta de Luz',           -142.60,  '2026-04-11', 'debit', 'synced', 'manual'),
    (uid, acc_nubank,  cat_saude,   'Farmácia Drogasil',      -43.80,   '2026-04-15', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_lazer,   'Show Luan Santana',      -180.00,  '2026-04-19', 'debit', 'synced', 'manual'),
    (uid, acc_nubank,  cat_saude,   'Academia SmartFit',      -99.90,   '2026-04-20', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_alim,    'Restaurante Madero',     -124.00,  '2026-04-22', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_transp,  'Uber',                   -42.30,   '2026-04-24', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_outros,  'Conta de Água',          -61.40,   '2026-04-25', 'debit', 'synced', 'manual'),
    (uid, acc_itau,    cat_alim,    'Açaí da Serra',          -38.00,   '2026-04-27', 'debit', 'synced', 'ai');

  -- ── Transações — Março 2026 ───────────────────────────────
  INSERT INTO transactions (user_id, account_id, category_id, description, amount, transaction_date, type, sync_status, categorized_by)
  VALUES
    (uid, acc_nubank, cat_receita, 'Salário', 5500.00, '2026-03-05', 'credit', 'synced', 'manual'),
    (uid, acc_sicredi, cat_receita, 'Dividendos Nubank', 340.00, '2026-03-10', 'credit', 'synced', 'manual'),
    (uid, acc_nubank,  cat_moradia, 'Aluguel',               -1200.00, '2026-03-03', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_alim,    'Supermercado Extra',     -315.80,  '2026-03-06', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_transp,  'Gasolina Ipiranga',      -200.00,  '2026-03-08', 'debit', 'synced', 'rule'),
    (uid, acc_itau,    cat_alim,    'iFood',                  -78.60,   '2026-03-10', 'debit', 'synced', 'ai'),
    (uid, acc_itau,    cat_assin,   'Netflix',                -44.90,   '2026-03-10', 'debit', 'synced', 'rule'),
    (uid, acc_itau,    cat_assin,   'Spotify',                -21.90,   '2026-03-10', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_outros,  'Conta de Luz',           -118.30,  '2026-03-12', 'debit', 'synced', 'manual'),
    (uid, acc_nubank,  cat_saude,   'Consulta Médica',        -220.00,  '2026-03-14', 'debit', 'synced', 'manual'),
    (uid, acc_nubank,  cat_saude,   'Academia SmartFit',      -99.90,   '2026-03-20', 'debit', 'synced', 'rule'),
    (uid, acc_nubank,  cat_lazer,   'Cinema Cinemark',        -54.00,   '2026-03-22', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_transp,  'Uber',                   -29.80,   '2026-03-25', 'debit', 'synced', 'ai'),
    (uid, acc_nubank,  cat_outros,  'Conta de Água',          -55.70,   '2026-03-26', 'debit', 'synced', 'manual'),
    (uid, acc_itau,    cat_alim,    'Restaurante Outback',    -188.00,  '2026-03-28', 'debit', 'synced', 'ai');

  -- ── Metas ─────────────────────────────────────────────────
  INSERT INTO goals (user_id, category_id, name, type, target_amount, current_amount, currency, period, start_date, end_date, is_active)
  VALUES
    (uid, NULL,       'Viagem nas Férias',   'savings_target', 8000.00, 2450.00, 'BRL', 'custom',  '2026-01-01', '2026-12-31', true),
    (uid, cat_alim,   'Limite Alimentação',  'spending_limit', 600.00,  432.40,  'BRL', 'monthly', '2026-05-01', NULL,         true),
    (uid, NULL,       'Fundo de Emergência', 'savings_target', 15000.00, 5680.00,'BRL', 'custom',  '2025-07-01', '2026-12-31', true);

  -- ── Investimentos ─────────────────────────────────────────
  INSERT INTO investments (user_id, name, type, institution, total_invested, current_value, currency, notes, is_active)
  VALUES
    (uid, 'Tesouro SELIC 2027',       'tesouro_direto',    'Tesouro Nacional',   10000.00, 10847.30, 'BRL', 'Vencimento: 01/03/2027', true),
    (uid, 'CDB 120% CDI',             'cdb',               'Nubank',              5000.00,  5287.40, 'BRL', '2 anos, resgate diário',  true),
    (uid, 'PETR4 — Petrobras',        'acoes',             'XP Investimentos',    2000.00,  2341.00, 'BRL', '80 ações @ R$ 29,26',    true),
    (uid, 'HGLG11 — FII Logística',   'fundo_imobiliario', 'Rico Investimentos',  3500.00,  3612.50, 'BRL', '14 cotas @ R$ 258,04',   true),
    (uid, 'LCI Bradesco 95% CDI',     'lci_lca',           'Bradesco',            4000.00,  4180.20, 'BRL', 'Vencimento: 15/09/2026', true);

  RAISE NOTICE 'Seed da conta demo concluído com sucesso!';
  RAISE NOTICE 'Contas criadas: 3 (Nubank, Sicredi, Itaú)';
  RAISE NOTICE 'Transações inseridas: ~46 (mar-mai 2026)';
  RAISE NOTICE 'Metas: 3 | Investimentos: 5';

END $$;
