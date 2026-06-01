# FlowTrack

Personal finance app with AI-powered transaction categorization, built as a portfolio project.

**Live demo → [flowtrack-afn.vercel.app](https://flowtrack-afn.vercel.app)**
_(Login: use the "Access demo mode" button — no sign-up required)_

---

## Features

- **Dashboard** — monthly metrics (balance, income, expenses) + 6-month sparkline chart
- **Transactions** — paginated list with filters, inline category editing, CSV export
- **AI Categorization** — Claude Haiku automatically categorizes transactions (registered users only)
- **Goals** — spending limits and savings targets with progress bars
- **Investments** — manual portfolio tracking with profitability metrics
- **Reports** — donut chart by category, bar chart by month, top expenses
- **Dark / light mode** — persisted in localStorage
- **Offline queue** — transactions created offline sync automatically on reconnect (IndexedDB)
- **Demo mode** — pre-filled data, weekly auto-reset via GitHub Actions

## Tech Stack

### Frontend
| | |
|---|---|
| React 19 + TypeScript | UI framework |
| Vite 8 | Build tool |
| Zustand | Global state (auth) |
| Axios | HTTP client with JWT interceptor |
| Dexie.js | IndexedDB offline queue |
| @supabase/supabase-js | Auth + direct DB queries |

### Backend
| | |
|---|---|
| FastAPI + Python 3.11 | REST API |
| Supabase PostgreSQL | Database with Row Level Security |
| Supabase Auth | JWT authentication (ES256 / HS256) |
| Claude Haiku | AI categorization with prompt caching |
| Structlog | Structured JSON logging |
| Sentry | Error monitoring |

### Infrastructure
| | |
|---|---|
| Vercel | Frontend hosting + auto-deploy |
| Railway | Backend hosting + auto-deploy |
| Supabase | Database + auth (São Paulo region) |
| GitHub Actions | CI (typecheck + build) + weekly demo reset |
| cron-job.org | Triggers AI worker every 5 minutes |

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- A [Supabase](https://supabase.com) project

### 1. Clone & install

```bash
git clone https://github.com/alyssom-fernandes/FlowTrack.git
cd FlowTrack
npm install          # installs concurrently at root
cd frontend && npm install
```

### 2. Configure environment

```bash
# Frontend
cp frontend/.env.example frontend/.env.local

# Backend
cp backend/.env.example backend/.env
```

Fill in the values from your Supabase project dashboard and create a Python virtual environment:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

### 3. Create the database schema

Run `docs/schema.sql` in the Supabase SQL Editor.

### 4. Seed demo data (optional)

```bash
cd backend
python demo_seed.py --full
```

### 5. Run

```bash
# From the repo root (with venv activated)
npm run dev
```

Frontend → `http://localhost:5173`  
Backend → `http://localhost:8000`  
API docs → `http://localhost:8000/docs`

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL (e.g. `http://localhost:8000`) |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_DEMO_EMAIL` | Demo account email |
| `VITE_DEMO_PASSWORD` | Demo account password |

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase dashboard |
| `ANTHROPIC_API_KEY` | Claude API key (optional — AI disabled if absent) |
| `INTERNAL_API_TOKEN` | Secret token for `/internal/*` endpoints |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `APP_ENV` | `development` or `production` |

## Deploy

Both platforms auto-deploy on push to `main`.

**Frontend (Vercel)**
- Root directory: `frontend/`
- Configuration: `frontend/vercel.json` (SPA rewrite rule)
- Set all `VITE_*` environment variables in Vercel dashboard

**Backend (Railway)**
- Root directory: `backend/`
- Configuration: `backend/railway.toml` + `backend/Procfile`
- Set all backend environment variables in Railway dashboard

**AI Categorization worker**
- Set up a POST cron at [cron-job.org](https://cron-job.org) every 5 minutes:
  - URL: `<RAILWAY_URL>/internal/process-queue`
  - Header: `X-Internal-Secret: <INTERNAL_API_TOKEN>`

## Project Structure

```
FlowTrack/
├── frontend/               React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/          Dashboard, Transactions, Goals, Investments, Reports, Profile
│   │   ├── components/     AppShell, Sidebar, UI primitives
│   │   ├── services.ts     Supabase client + Axios API
│   │   ├── store.ts        Zustand auth store + Dexie offline queue
│   │   └── tokens.css      Design system tokens
│   └── vercel.json
├── backend/                FastAPI + Python 3.11
│   ├── app/
│   │   ├── api/v1/         All REST endpoints
│   │   ├── core/           Config, DB client, JWT security, logging
│   │   └── integrations/   Claude Haiku categorization worker
│   ├── demo_seed.py        Demo data seeder with smart reset
│   └── railway.toml
├── docs/
│   └── schema.sql          Full Supabase PostgreSQL schema
└── .github/workflows/
    ├── ci.yml              Typecheck + build on every push
    └── demo-reset.yml      Weekly demo data reset (Monday 06:00 UTC)
```

## Author

**Alyssom Fernandes** — AFN SYSTEMS  
[github.com/alyssom-fernandes](https://github.com/alyssom-fernandes)
