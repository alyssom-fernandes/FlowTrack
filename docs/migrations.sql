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
grant select on audit_log to authenticated;
grant select, insert, update on net_worth_snapshots to authenticated;

-- v2.0 — regras de acesso revistas (para bancos criados antes de outubro de 2026)
-- Cache global de categorias: só a API grava linhas sem dono
drop policy if exists "merchant_cache: insert own" on merchant_cache;
drop policy if exists "merchant_cache: update own" on merchant_cache;
create policy "merchant_cache: insert own" on merchant_cache for insert with check (auth.uid() = user_id);
create policy "merchant_cache: update own" on merchant_cache for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Histórico: só leitura para o usuário
drop policy if exists "audit_log: insert own" on audit_log;
drop policy if exists "audit_log: update own" on audit_log;
drop policy if exists "Users can manage own audit log" on audit_log;
drop policy if exists "audit_log: select own" on audit_log;
create policy "audit_log: select own" on audit_log for select using (auth.uid() = user_id);
revoke insert, update, delete on audit_log from authenticated;

-- v2.1 — escrita só pela API (revisão adversarial de outubro de 2026)
-- Categoria criada por usuário nunca é padrão
drop policy if exists "categories: insert own" on categories;
drop policy if exists "categories: update own" on categories;
create policy "categories: insert own" on categories for insert with check (auth.uid() = user_id and is_default = false);
create policy "categories: update own" on categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id and is_default = false);
-- O papel authenticated só lê (RLS); quem grava é a API com service_role
revoke insert, update, delete on all tables in schema public from authenticated;
-- Linhas antigas forjadas: "padrão" com dono deixam de ser padrão
update categories set is_default = false where is_default = true and user_id is not null;

-- v2.2 — identidade das metas de economia (cor da paleta e glifo, ambos opcionais)
alter table goals add column if not exists color text;
alter table goals add column if not exists icon text;

-- v2.3 — fila de categorização com trava e recorrências atômicas (revisão do backend de novembro de 2026)
-- Pega um lote da fila de uma vez: FOR UPDATE SKIP LOCKED impede que duas chamadas peguem o mesmo item.
-- Item em 'processing' há mais de 15 minutos (worker caiu no meio) volta a ser elegível.
create or replace function claim_categorization_queue(p_limit integer)
returns setof categorization_queue
language sql
set search_path = public
as $$
  update categorization_queue
     set status = 'processing'
   where id in (
     select id from categorization_queue
      where status = 'pending'
         or (status = 'processing' and updated_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning *;
$$;

-- Transação e saldo numa só transação do banco: ou as duas gravações valem, ou nenhuma
create or replace function create_transaction_with_balance(
  p_user_id uuid, p_account_id uuid, p_category_id uuid, p_description text,
  p_description_normalized text, p_amount numeric, p_transaction_date date, p_type text,
  p_is_recurring boolean, p_categorized_by categorized_by_enum, p_dedup_hash text
)
returns setof transactions
language plpgsql
set search_path = public
as $$
declare
  v_tx transactions;
begin
  insert into transactions (user_id, account_id, category_id, description, description_normalized, amount,
                            transaction_date, type, is_recurring, sync_status, categorized_by, dedup_hash)
  values (p_user_id, p_account_id, p_category_id, p_description, p_description_normalized, p_amount,
          p_transaction_date, p_type, p_is_recurring, 'synced', p_categorized_by, p_dedup_hash)
  returning * into v_tx;
  update accounts set balance = balance + p_amount where id = p_account_id and user_id = p_user_id;
  return next v_tx;
end;
$$;

-- Só a API (service_role) chama as duas funções; pela REST pública ninguém as executa
revoke execute on function claim_categorization_queue(integer) from public, anon, authenticated;
revoke execute on function create_transaction_with_balance(uuid, uuid, uuid, text, text, numeric, date, text, boolean, categorized_by_enum, text) from public, anon, authenticated;
grant execute on function claim_categorization_queue(integer) to service_role;
grant execute on function create_transaction_with_balance(uuid, uuid, uuid, text, text, numeric, date, text, boolean, categorized_by_enum, text) to service_role;
