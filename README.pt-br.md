# FlowTrack

Aplicativo de controle financeiro pessoal com categorização de transações via IA — desenvolvido como projeto de portfólio de nível production.

**Demo ao vivo → [flowtrack-afn.vercel.app](https://flowtrack-afn.vercel.app)**
_(Login: clique em "Acessar modo demo" — sem cadastro)_

---

## O que faz

FlowTrack é um gerenciador financeiro completo com backend em FastAPI, frontend em React e Claude Haiku para categorização inteligente de transações.

### Funcionalidades

| Área | Funcionalidades |
|---|---|
| **Dashboard** | Métricas mensais (saldo, receitas, gastos), sparkline de saldo dos últimos 6 meses, alertas de orçamento, card de insight de IA |
| **Transações** | CRUD com filtros (busca com debounce, colapsáveis no mobile), paginação, edição inline de categoria, badge de parcelas ("3/6"), tag de recorrente |
| **Importação** | Extrato em PDF de 4 bancos (Nubank, Sicredi, Mercado Pago, Will Bank), OFX, CSV — prévia antes de confirmar a importação em lote |
| **Transferências** | Transferências atômicas de dupla entrada entre contas com `import_batch_id` compartilhado |
| **Orçamentos** | Orçamento mensal por categoria; alertas automáticos em 80% e 100% do limite |
| **Tags** | Rótulos livres nas transações, filtráveis na listagem |
| **Metas** | Limites de gasto e metas de poupança com barras de progresso; rastreamento automático via transações |
| **Relatórios** | Donut chart por categoria, gráfico de barras mensal, top 5 gastos, comparação entre períodos, exportação PDF |
| **Fluxo de caixa** | Projeção de 12 meses baseada em transações recorrentes |
| **Patrimônio líquido** | Snapshots históricos com sparkline; passivos subtraídos dos investimentos |
| **Investimentos** | Carteira manual agrupada por tipo de ativo com métricas de rentabilidade |
| **Log de auditoria** | Toda ação destrutiva é registrada e reversível (desfazer) |
| **IA insights** | Insights financeiros personalizados sob demanda via Claude Haiku |
| **Offline** | Transações criadas sem conexão sincronizam ao reconectar via fila IndexedDB + health-check ping |
| **PWA** | Instalável no iOS, Android e desktop |
| **Modo demo** | Conta pré-preenchida, reset automático semanal via GitHub Actions |

### Categorização IA — pipeline em 3 camadas

1. **Regras determinísticas** — pattern matching para pagadores conhecidos (zero custo de API)
2. **Cache de merchant** — reutiliza decisões anteriores do Haiku para o mesmo estabelecimento
3. **Claude Haiku** — fallback para merchants desconhecidos (~90% de redução de chamadas vs. abordagem ingênua)

O worker é não-bloqueante com retry e backoff exponencial (1 min → 3 min → 9 min). Prompt caching no system prompt reduz o custo de tokens por chamada.

---

## Stack Técnica

### Frontend
| | |
|---|---|
| React 19 + TypeScript | Framework de UI |
| Vite 8 | Build tool |
| Zustand | Estado global (auth + toasts) |
| Axios | Cliente HTTP com interceptor JWT |
| Dexie.js | Fila offline via IndexedDB |
| @supabase/supabase-js | Auth + queries diretas ao banco |

### Backend
| | |
|---|---|
| FastAPI + Python 3.11 | API REST |
| Supabase PostgreSQL | Banco com Row Level Security |
| Supabase Auth | Autenticação JWT (ES256 / HS256 fallback, JWKS com cache de 1h) |
| Claude Haiku | Categorização IA com prompt caching |
| Structlog | Logging estruturado em JSON |
| Sentry | Monitoramento de erros |

### Infraestrutura
| | |
|---|---|
| Vercel | Hospedagem do frontend + auto-deploy |
| Railway | Hospedagem do backend + auto-deploy |
| Supabase | PostgreSQL + auth (região São Paulo) |
| GitHub Actions | CI (typecheck + build) + reset semanal do demo |
| cron-job.org | Dispara o worker de IA a cada 5 minutos |

---

## Destaques de arquitetura

- **Segurança**: busca de chave JWKS por `kid` do header, ES256 + fallback HS256, RLS como segunda camada de defesa, service role isolado ao backend. Strip de BOM em env vars evita falhas silenciosas de auth em hosts Windows.
- **Sync offline**: usa `window.addEventListener('online')` + health-check ping antes de processar a fila — sem Background Sync API (Safari iOS não suporta).
- **Sem Tailwind / Shadcn**: design system próprio em `tokens.css` com suporte completo a dark/light, escala tipográfica, grid responsivo e scrollbar customizada. Decisão deliberada documentada em `docs/architecture.md`.
- **57 testes de integração**: cobrem CRUD de contas e transações, transferências (guarda mesma conta), parse de OFX, summary, cashflow, patrimônio líquido, alertas de orçamento.

---

## Primeiros Passos

### Pré-requisitos
- Node.js 20+
- Python 3.11+
- Um projeto no [Supabase](https://supabase.com)

### 1. Clonar e instalar

```bash
git clone https://github.com/alyssom-fernandes/FlowTrack.git
cd FlowTrack
npm install          # instala o concurrently na raiz
cd frontend && npm install
```

### 2. Configurar variáveis de ambiente

```bash
# Frontend
cp frontend/.env.example frontend/.env.local

# Backend
cp backend/.env.example backend/.env
```

Preencha com os dados do seu projeto Supabase e crie o ambiente virtual Python:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

### 3. Criar o schema do banco

Execute `docs/schema.sql` no SQL Editor do Supabase.

### 4. Popular dados de demonstração (opcional)

```bash
cd backend
python demo_seed.py --full
```

### 5. Rodar

```bash
# Da raiz do projeto (com venv ativado)
npm run dev
```

Frontend → `http://localhost:5173`  
Backend → `http://localhost:8000`  
Docs da API → `http://localhost:8000/docs`

---

## Variáveis de Ambiente

### Frontend (`frontend/.env.local`)

| Variável | Descrição |
|---|---|
| `VITE_API_URL` | URL do backend (ex: `http://localhost:8000`) |
| `VITE_SUPABASE_URL` | URL do seu projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/pública do Supabase |
| `VITE_DEMO_EMAIL` | E-mail da conta demo |
| `VITE_DEMO_PASSWORD` | Senha da conta demo |

### Backend (`backend/.env`)

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anon do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role (ignora RLS) |
| `SUPABASE_JWT_SECRET` | JWT secret (dashboard do Supabase) |
| `ANTHROPIC_API_KEY` | Chave da API Claude (opcional — IA desabilitada se ausente) |
| `INTERNAL_API_TOKEN` | Token secreto para endpoints `/internal/*` |
| `CORS_ORIGINS` | Origens permitidas separadas por vírgula |
| `APP_ENV` | `development` ou `production` |

---

## Deploy

Ambas as plataformas fazem deploy automático a cada push na `main`.

**Frontend (Vercel)**
- Diretório raiz: `frontend/`
- Configuração: `frontend/vercel.json` (regra de rewrite para SPA)
- Adicione as variáveis `VITE_*` no dashboard da Vercel

**Backend (Railway)**
- Diretório raiz: `backend/`
- Configuração: `backend/railway.toml` + `backend/Procfile`
- Adicione as variáveis de ambiente no dashboard do Railway

**Worker de categorização IA**
- Configure um cron POST no [cron-job.org](https://cron-job.org) a cada 5 minutos:
  - URL: `<URL_RAILWAY>/internal/process-queue`
  - Header: `X-Internal-Secret: <INTERNAL_API_TOKEN>`

---

## Estrutura do Projeto

```
FlowTrack/
├── frontend/               React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/          Dashboard, Transações, Metas, Investimentos, Relatórios, Perfil
│   │   ├── components/     AppShell, Sidebar, primitivos de UI (ui.tsx, layout.tsx)
│   │   ├── services.ts     Supabase client + serviços da API Axios
│   │   ├── store.ts        Zustand stores + fila offline Dexie
│   │   ├── utils.ts        Formatters, normalizers, useOnlineStatus
│   │   └── tokens.css      Design system tokens (dark/light, tipografia, grid)
│   └── vercel.json
├── backend/                FastAPI + Python 3.11
│   ├── app/
│   │   ├── api/v1/         Todos os endpoints REST (routers.py)
│   │   ├── core/           Config, DB client, segurança JWT, logging
│   │   └── integrations/   Worker de categorização Claude Haiku
│   ├── tests/              57 testes de integração (pytest)
│   ├── demo_seed.py        Seed de dados demo com reset inteligente
│   └── railway.toml
├── docs/
│   ├── schema.sql          Schema completo PostgreSQL do Supabase
│   ├── architecture.md     Decisões de design e trade-offs
│   └── parsers.md          Documentação dos parsers de PDF bancários
└── .github/workflows/
    ├── ci.yml              Typecheck + build em todo push
    └── demo-reset.yml      Reset semanal dos dados demo (segunda 06:00 UTC)
```

---

## Autor

**Alyssom Fernandes** — AFN SYSTEMS  
[github.com/alyssom-fernandes](https://github.com/alyssom-fernandes)
