# Changelog

All notable changes to FlowTrack are documented here.

## [1.4.0] — 2026-06-03

### Added
- **Net worth tracking** — historical snapshots with sparkline chart
- **Cashflow projections** — 12-month forward projection based on recurring transactions
- **Audit log with undo** — every destructive action is logged and reversible
- **Budget progress card** — dashboard card showing budget consumption with 80%/100% threshold alerts
- **Integration tests** — 57 tests covering all critical backend paths (accounts, transactions, transfers, OFX parse, summary, cashflow, net worth, budget alerts)

## [1.3.0] — 2026-06-02

### Added
- **PWA support** — installable on iOS/Android/desktop with offline-first architecture
- **AI insights** — Claude Haiku generates personalized financial insights on demand
- **Budgets** — monthly budget per category with automatic 80% and 100% alerts
- **Tags** — free-form labels on transactions, filterable in the transaction list
- **Cashflow view** — visual projected cashflow for the next 12 months
- **Period comparison** — compare spending between any two custom date ranges in Reports
- **PDF export** — export full financial reports as PDF
- **Alerts panel** — dashboard panel surfacing budget alerts and unusual spending patterns

## [1.2.0] — 2026-05-25

### Added
- **Transfers** — atomic double-entry transfers between accounts (shared `import_batch_id`)
- **Installment payments** — split transactions into N installments with badge display ("3/6")
- **Recurring transactions** — mark transactions as recurring; auto-generated monthly via cron
- **PDF bank statement import** — parse statements from Nubank, Sicredi, Mercado Pago, Will Bank
- **OFX import** — parse and bulk-import OFX bank export files
- **CSV import** — import transactions from CSV
- **Goals auto-tracking** — spending limit and savings targets auto-update from transactions
- **Categories CRUD** — create, rename, delete custom categories in Profile

### Fixed
- Mobile layout for Transactions, Reports, and Dashboard
- Offline banner wired to AppShell; health-check ping before processing sync queue
- Strip UTF-8 BOM from env vars on Windows (avoids silent Supabase auth failures)

## [1.1.0] — 2026-05-15

### Added
- **AI categorization worker** — non-blocking 3-layer pipeline: deterministic rules → merchant cache → Claude Haiku; ~90% API call reduction via caching and prompt caching
- **Investments** — manual portfolio tracking grouped by asset type with profitability metrics
- **Reports** — donut chart by category, monthly bar chart, top 5 expenses, custom date range
- **Password reset** — forgot password flow with PKCE-safe recovery redirect
- **Accounts UI** — create, rename, delete accounts; balance auto-adjusted on transaction changes
- **Demo mode** — pre-seeded account with weekly auto-reset via GitHub Actions (Monday 06:00 UTC)
- **CI/CD** — GitHub Actions pipeline (typecheck + Vite build) on every push; auto-deploy to Vercel and Railway on `main`

### Fixed
- Dashboard 6-month sparkline aligned to correct months
- Supabase PKCE recovery token race condition on password reset

## [1.0.0] — 2026-05-01

### Added
- **Dashboard** — monthly metrics (balance, income, expenses) + 6-month net-balance sparkline
- **Transactions** — paginated list with filters (debounced search, collapsible on mobile), inline category edit, CSV export
- **Goals** — spending limits and savings targets with progress bars
- **Dark / light mode** — persisted in localStorage
- **Offline queue** — transactions created offline sync on reconnect via Dexie.js (IndexedDB); uses `window.addEventListener('online')` + health-check ping (no Background Sync API — Safari iOS compat)
- **JWT authentication** — ES256 + HS256 fallback, JWKS with 1-hour cache, `kid`-based key lookup
- **Row Level Security** — Supabase RLS as a second defense layer; service role used only in backend
- **Structured logging** — structlog with JSON output; Sentry for error monitoring
