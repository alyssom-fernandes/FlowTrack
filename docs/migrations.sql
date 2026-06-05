-- ============================================================
-- FlowTrack — Migrations (v1.1 → v1.4)
-- Execute no Supabase SQL Editor se você já tem o schema v1.0
-- aplicado (schema.sql). Caso contrário, execute schema.sql
-- diretamente — ele já inclui tudo abaixo.
-- ============================================================

-- v1.3 — tags em transações
alter table transactions add column if not exists tags text[];

-- v1.3 — orçamentos mensais
create table if not exists budgets (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references categories(id) on delete cascade,
  month         text not null,
  limit_amount  numeric(15, 2) not null,
  created_at    timestamptz not null default now(),
  unique(user_id, category_id, month)
);
create index if not exists idx_budgets_user_month on budgets(user_id, month);
alter table budgets enable row level security;
create policy "budgets: select own" on budgets for select using (auth.uid() = user_id);
create policy "budgets: insert own" on budgets for insert with check (auth.uid() = user_id);
create policy "budgets: update own" on budgets for update using (auth.uid() = user_id);
create policy "budgets: delete own" on budgets for delete using (auth.uid() = user_id);

-- v1.4 — log de auditoria
create table if not exists audit_log (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  entity_type  text not null,
  entity_id    text not null,
  action       text not null,
  old_values   jsonb,
  new_values   jsonb,
  undone       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_log_user on audit_log(user_id, created_at desc);
alter table audit_log enable row level security;
create policy "audit_log: select own" on audit_log for select using (auth.uid() = user_id);
create policy "audit_log: insert own" on audit_log for insert with check (auth.uid() = user_id);
create policy "audit_log: update own" on audit_log for update using (auth.uid() = user_id);

-- v1.4 — snapshots de patrimônio líquido
create table if not exists net_worth_snapshots (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  total_accounts    numeric(15, 2) not null default 0,
  total_investments numeric(15, 2) not null default 0,
  net_worth         numeric(15, 2) not null default 0,
  created_at        timestamptz not null default now(),
  unique(user_id, date)
);
create index if not exists idx_nws_user_date on net_worth_snapshots(user_id, date);
alter table net_worth_snapshots enable row level security;
create policy "nws: select own" on net_worth_snapshots for select using (auth.uid() = user_id);
create policy "nws: insert own" on net_worth_snapshots for insert with check (auth.uid() = user_id);
create policy "nws: update own" on net_worth_snapshots for update using (auth.uid() = user_id);

-- grants para as novas tabelas
grant all on budgets, audit_log, net_worth_snapshots to service_role;
grant select, insert, update, delete on budgets to authenticated;
grant select, insert, update on audit_log to authenticated;
grant select, insert, update on net_worth_snapshots to authenticated;
