# FlowTrack — Architecture

## Overview

FlowTrack is a personal finance PWA built as a monorepo with a React + TypeScript frontend and a FastAPI Python backend, backed by Supabase (PostgreSQL).

## Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React + TypeScript + Vite | Modern, typed, fast DX |
| State | Zustand | Lightweight, no boilerplate |
| Offline queue | Dexie.js (IndexedDB) | Better API than raw IndexedDB |
| HTTP client | Axios | Interceptors for JWT refresh |
| Backend | FastAPI (Python) | Modern, typed, auto Swagger |
| Database | Supabase (PostgreSQL) | Auth + DB + RLS in one |
| Auth | Supabase Auth + JWKS | No custom JWT implementation |
| AI | Claude Haiku + Prompt Caching | Cost-efficient categorization |
| Frontend hosting | Vercel | Native React support |
| Backend hosting | Railway | No aggressive cold starts |
| Monitoring | Sentry + structlog | Errors + structured logs |

## Key Architectural Decisions

### Hybrid AI Categorization
Transactions go through three layers before hitting the Claude API:
1. Deterministic rules (e.g. "NETFLIX" → Entertainment)
2. `merchant_cache` table lookup (normalized description → category)
3. Claude Haiku with Prompt Caching — only for unresolved cases

This reduces API costs by ~90% after initial usage.

### Non-blocking Categorization
Transactions are saved immediately with status "A categorizar". A background worker processes the `categorization_queue` table every 5 minutes via an external cron (cron-job.org) calling `POST /internal/process-queue`. The frontend listens for updates via Supabase Realtime.

### Offline-first PWA
Transactions created offline are stored in IndexedDB (Dexie.js) with `sync_status: pending`. When connectivity is restored, `window.addEventListener('online')` triggers the sync queue. Background Sync API was intentionally avoided — it is not supported on iOS Safari.

### Security
- JWT from Supabase Auth validated in FastAPI via JWKS public keys
- Row Level Security (RLS) enabled on all multi-user tables as second defense layer
- Internal endpoint protected by `X-Internal-Secret` header
- Logs sanitized to avoid capturing sensitive financial data

## Rejected Decisions (and why)

| Decision | Reason |
|---|---|
| Next.js | SSR unnecessary for auth-gated app |
| Turborepo / Nx | Overhead for solo developer |
| Shadcn UI / Tailwind | Intentional CSS tokens for learning and visual differentiation |
| TanStack Query | Zustand + Axios sufficient for Phase 1 |
| Celery + Redis | Queue table in Supabase is sufficient for personal use volume |
| Background Sync | Not supported on iOS Safari |
| PDF parsing (Phase 1) | Too complex, OFX + CSV covers 90% of use cases |
