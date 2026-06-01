# FlowTrack

Aplicativo de controle financeiro pessoal com categorização de transações via IA, desenvolvido como projeto de portfólio.

**Demo ao vivo → [flowtrack-afn.vercel.app](https://flowtrack-afn.vercel.app)**
_(Login: clique em "Acessar modo demo" — sem cadastro)_

---

## Funcionalidades

- **Dashboard** — métricas mensais (saldo, receitas, gastos) + gráfico sparkline de 6 meses
- **Transações** — lista paginada com filtros, edição inline de categoria, exportação CSV
- **Categorização IA** — Claude Haiku categoriza transações automaticamente (usuários cadastrados)
- **Metas** — limites de gasto e metas de poupança com barras de progresso
- **Investimentos** — carteira manual com métricas de rentabilidade
- **Relatórios** — donut chart por categoria, gráfico de barras mensal, maiores gastos
- **Dark / light mode** — salvo no localStorage
- **Fila offline** — transações criadas sem internet sincronizam automaticamente ao reconectar (IndexedDB)
- **Modo demo** — dados pré-preenchidos, reset automático semanal via GitHub Actions

## Stack Técnica

### Frontend
| | |
|---|---|
| React 19 + TypeScript | Framework de UI |
| Vite 8 | Build tool |
| Zustand | Estado global (autenticação) |
| Axios | Cliente HTTP com interceptor JWT |
| Dexie.js | Fila offline via IndexedDB |
| @supabase/supabase-js | Auth + queries diretas ao banco |

### Backend
| | |
|---|---|
| FastAPI + Python 3.11 | API REST |
| Supabase PostgreSQL | Banco com Row Level Security |
| Supabase Auth | Autenticação JWT (ES256 / HS256) |
| Claude Haiku | Categorização IA com prompt caching |
| Structlog | Logging estruturado em JSON |
| Sentry | Monitoramento de erros |

### Infraestrutura
| | |
|---|---|
| Vercel | Hospedagem do frontend + auto-deploy |
| Railway | Hospedagem do backend + auto-deploy |
| Supabase | Banco + auth (região São Paulo) |
| GitHub Actions | CI (typecheck + build) + reset semanal do demo |
| cron-job.org | Dispara o worker de IA a cada 5 minutos |

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

## Estrutura do Projeto

```
FlowTrack/
├── frontend/               React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/          Dashboard, Transações, Metas, Investimentos, Relatórios, Perfil
│   │   ├── components/     AppShell, Sidebar, componentes de UI
│   │   ├── services.ts     Supabase client + Axios API
│   │   ├── store.ts        Zustand store + fila offline Dexie
│   │   └── tokens.css      Design system tokens
│   └── vercel.json
├── backend/                FastAPI + Python 3.11
│   ├── app/
│   │   ├── api/v1/         Todos os endpoints REST
│   │   ├── core/           Config, DB client, segurança JWT, logging
│   │   └── integrations/   Worker de categorização Claude Haiku
│   ├── demo_seed.py        Seed de dados demo com reset inteligente
│   └── railway.toml
├── docs/
│   └── schema.sql          Schema completo PostgreSQL do Supabase
└── .github/workflows/
    ├── ci.yml              Typecheck + build em todo push
    └── demo-reset.yml      Reset semanal dos dados demo (segunda 06:00 UTC)
```

## Autor

**Alyssom Fernandes** — AFN SYSTEMS  
[github.com/alyssom-fernandes](https://github.com/alyssom-fernandes)
