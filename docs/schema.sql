-- ============================================================
-- FlowTrack — Schema SQL completo
-- Execute no Supabase SQL Editor na ordem apresentada
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type categorized_by_enum as enum ('rule', 'cache', 'ai', 'manual');
create type sync_status_enum as enum ('synced', 'pending', 'failed');
create type goal_type_enum as enum ('spending_limit', 'savings_target');
create type queue_status_enum as enum ('pending', 'processing', 'done', 'failed');
create type investment_type_enum as enum (
  'renda_fixa', 'renda_variavel', 'fundo_imobiliario',
  'tesouro_direto', 'cdb', 'lci_lca', 'acoes',
  'criptomoeda', 'outro'
);

-- ============================================================
-- ACCOUNTS (contas bancárias)
-- ============================================================
create table accounts (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  bank_name     text not null,
  bank_color    text default '#9D2449',
  account_type  text not null default 'checking', -- checking, savings, credit, investment
  currency      text not null default 'BRL',
  balance       numeric(15, 2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- CATEGORIES
-- ============================================================
create table categories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade, -- null = categoria global
  name        text not null,
  icon        text,
  color       text default '#9D2449',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Categorias padrão globais (sem user_id)
insert into categories (name, icon, color, is_default) values
  ('Alimentação',     'utensils',       '#e06c75', true),
  ('Transporte',      'car',            '#e09c4c', true),
  ('Moradia',         'home',           '#61afef', true),
  ('Saúde',           'heart',          '#98c379', true),
  ('Educação',        'book',           '#c678dd', true),
  ('Lazer',           'music',          '#56b6c2', true),
  ('Vestuário',       'shirt',          '#e5c07b', true),
  ('Assinaturas',     'repeat',         '#abb2bf', true),
  ('Investimentos',   'trending-up',    '#4caf7d', true),
  ('Receita',         'dollar-sign',    '#4caf7d', true),
  ('Transferência',   'arrow-right',    '#61afef', true),
  ('Outros',          'more-horizontal','#606060', true);

-- ============================================================
-- MERCHANT CACHE (cache de categorização)
-- ============================================================
create table merchant_cache (
  id                     uuid primary key default uuid_generate_v4(),
  normalized_description text not null,
  category_id            uuid not null references categories(id),
  confidence             numeric(4, 3) not null default 1.000, -- 0.000 a 1.000
  source                 text not null default 'rule', -- rule, ai, manual
  user_id                uuid references auth.users(id) on delete cascade, -- null = regra global
  usage_count            integer not null default 1,
  updated_at             timestamptz not null default now(),
  unique(normalized_description, user_id)
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
create table transactions (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  account_id              uuid not null references accounts(id) on delete cascade,
  category_id             uuid references categories(id),
  description             text not null,
  description_normalized  text,
  amount                  numeric(15, 2) not null, -- negativo = saída, positivo = entrada
  currency                text not null default 'BRL',
  transaction_date        date not null,
  transaction_at          timestamptz,             -- data/hora exata quando disponível
  type                    text not null default 'debit', -- debit, credit, transfer
  is_recurring            boolean not null default false,
  installment_current     integer,                 -- parcela atual (ex: 2)
  installment_total       integer,                 -- total de parcelas (ex: 12)
  -- Categorização
  categorized_by          categorized_by_enum,
  confidence_score        numeric(4, 3),
  -- Importação
  import_batch_id         uuid,
  parser_version          text,
  dedup_hash              text unique,             -- hash(account_id+date+amount+desc_normalized)
  -- Sync
  sync_status             sync_status_enum not null default 'synced',
  -- Metadados
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Índices para performance
create index idx_transactions_user_id on transactions(user_id);
create index idx_transactions_account_id on transactions(account_id);
create index idx_transactions_date on transactions(transaction_date desc);
create index idx_transactions_category on transactions(category_id);
create index idx_transactions_user_date on transactions(user_id, transaction_date desc);

-- ============================================================
-- CATEGORIZATION QUEUE
-- ============================================================
create table categorization_queue (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  status         queue_status_enum not null default 'pending',
  retry_count    integer not null default 0,
  max_retries    integer not null default 3,
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_queue_status on categorization_queue(status);
create index idx_queue_user on categorization_queue(user_id);

-- ============================================================
-- IMPORT BATCHES
-- ============================================================
create table import_batches (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  account_id        uuid not null references accounts(id) on delete cascade,
  filename          text not null,
  parser_used       text not null,
  parser_version    text not null,
  total_rows        integer not null default 0,
  imported_rows     integer not null default 0,
  duplicate_rows    integer not null default 0,
  error_rows        integer not null default 0,
  status            text not null default 'processing', -- processing, done, failed
  error_message     text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

-- ============================================================
-- GOALS (metas)
-- ============================================================
create table goals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category_id     uuid references categories(id),
  name            text not null,
  type            goal_type_enum not null,
  target_amount   numeric(15, 2) not null,
  current_amount  numeric(15, 2) not null default 0,
  currency        text not null default 'BRL',
  period          text not null default 'monthly', -- monthly, yearly, custom
  start_date      date not null default current_date,
  end_date        date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- INVESTMENTS (investimentos)
-- ============================================================
create table investments (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  account_id       uuid references accounts(id),
  name             text not null,
  type             investment_type_enum not null default 'outro',
  institution      text,
  total_invested   numeric(15, 2) not null default 0,
  current_value    numeric(15, 2) not null default 0,
  currency         text not null default 'BRL',
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- DEMO USERS (controle da conta demo)
-- ============================================================
create table demo_users (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade unique,
  last_reset   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- UPDATED_AT TRIGGER (atualiza updated_at automaticamente)
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_accounts_updated_at
  before update on accounts
  for each row execute function update_updated_at();

create trigger trg_transactions_updated_at
  before update on transactions
  for each row execute function update_updated_at();

create trigger trg_goals_updated_at
  before update on goals
  for each row execute function update_updated_at();

create trigger trg_investments_updated_at
  before update on investments
  for each row execute function update_updated_at();

create trigger trg_merchant_cache_updated_at
  before update on merchant_cache
  for each row execute function update_updated_at();

create trigger trg_queue_updated_at
  before update on categorization_queue
  for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS em todas as tabelas
alter table accounts             enable row level security;
alter table transactions         enable row level security;
alter table categories           enable row level security;
alter table merchant_cache       enable row level security;
alter table categorization_queue enable row level security;
alter table import_batches       enable row level security;
alter table goals                enable row level security;
alter table investments          enable row level security;
alter table demo_users           enable row level security;

-- ACCOUNTS
create policy "accounts: select own" on accounts
  for select using (auth.uid() = user_id);
create policy "accounts: insert own" on accounts
  for insert with check (auth.uid() = user_id);
create policy "accounts: update own" on accounts
  for update using (auth.uid() = user_id);
create policy "accounts: delete own" on accounts
  for delete using (auth.uid() = user_id);

-- TRANSACTIONS
create policy "transactions: select own" on transactions
  for select using (auth.uid() = user_id);
create policy "transactions: insert own" on transactions
  for insert with check (auth.uid() = user_id);
create policy "transactions: update own" on transactions
  for update using (auth.uid() = user_id);
create policy "transactions: delete own" on transactions
  for delete using (auth.uid() = user_id);

-- CATEGORIES (globais visíveis para todos, personalizadas só do próprio usuário)
create policy "categories: select global or own" on categories
  for select using (user_id is null or auth.uid() = user_id);
create policy "categories: insert own" on categories
  for insert with check (auth.uid() = user_id);
create policy "categories: update own" on categories
  for update using (auth.uid() = user_id);
create policy "categories: delete own" on categories
  for delete using (auth.uid() = user_id);

-- MERCHANT CACHE (globais visíveis para todos, personalizadas só do próprio usuário)
create policy "merchant_cache: select global or own" on merchant_cache
  for select using (user_id is null or auth.uid() = user_id);
create policy "merchant_cache: insert own" on merchant_cache
  for insert with check (auth.uid() = user_id or user_id is null);
create policy "merchant_cache: update own" on merchant_cache
  for update using (auth.uid() = user_id or user_id is null);

-- CATEGORIZATION QUEUE
create policy "queue: select own" on categorization_queue
  for select using (auth.uid() = user_id);
create policy "queue: insert own" on categorization_queue
  for insert with check (auth.uid() = user_id);
create policy "queue: update own" on categorization_queue
  for update using (auth.uid() = user_id);
create policy "queue: delete own" on categorization_queue
  for delete using (auth.uid() = user_id);

-- IMPORT BATCHES
create policy "import_batches: select own" on import_batches
  for select using (auth.uid() = user_id);
create policy "import_batches: insert own" on import_batches
  for insert with check (auth.uid() = user_id);
create policy "import_batches: update own" on import_batches
  for update using (auth.uid() = user_id);

-- GOALS
create policy "goals: select own" on goals
  for select using (auth.uid() = user_id);
create policy "goals: insert own" on goals
  for insert with check (auth.uid() = user_id);
create policy "goals: update own" on goals
  for update using (auth.uid() = user_id);
create policy "goals: delete own" on goals
  for delete using (auth.uid() = user_id);

-- INVESTMENTS
create policy "investments: select own" on investments
  for select using (auth.uid() = user_id);
create policy "investments: insert own" on investments
  for insert with check (auth.uid() = user_id);
create policy "investments: update own" on investments
  for update using (auth.uid() = user_id);
create policy "investments: delete own" on investments
  for delete using (auth.uid() = user_id);

-- DEMO USERS
create policy "demo_users: select own" on demo_users
  for select using (auth.uid() = user_id);
create policy "demo_users: insert own" on demo_users
  for insert with check (auth.uid() = user_id);
create policy "demo_users: update own" on demo_users
  for update using (auth.uid() = user_id);

-- ============================================================
-- GRANTS (permissões de acesso por role)
-- service_role: usado pelo backend FastAPI (bypass RLS via privileges)
-- authenticated: usuários autenticados via Supabase Auth (RLS aplica)
-- anon: usuários não autenticados (RLS aplica)
-- ============================================================
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select, insert, update, delete on all tables    in schema public to authenticated;
grant usage on all sequences                          in schema public to authenticated;

grant select on categories, merchant_cache            to anon;
