# Changelog

All notable changes to FlowTrack are documented here. Dates follow the commits where each set of changes landed.

## [2.2.0] — 2026-10-15

What the design review of 2.1.0 still pointed out.

### Changed
- **Pace chart** — while the month runs it shows the gap to the expected pace day by day around an "on pace" line, so a R$ 220 difference is visible instead of two overlapping lines; the cumulative view with the ceiling comes back at the end of the month
- **One month picker** — Budgets uses the same month pill as Transactions, with an "×" back to the current month; the period menu always lists the same options
- **Empty states** — Goals and Budgets show sample goals and budgets with names, amounts and colors instead of gray bars that looked like loading
- **Colors** — custom categories no longer offer the brand wine; colors already used by another category are marked and a new category starts on a free one; a savings goal shows only its own color
- **Goal icons** — goals pick from goal-like icons (piggy bank, trip, home, car…), and the trip icon is a real plane
- **Phones** — the review banner uses the full width with an "×" to leave; editing a transaction keeps Save and Delete in the footer (the title "×" closes)
- **Import review** — columns follow the transaction list (description, category, amount on the right edge)
- **Investments** — the distribution list drops the small bars that repeated the stacked bar
- **Reports tables on phones** — "Spending vs. May" shows the percentage with the same color rule as the desktop table
- Sidebar group "Account" is now "You", so it does not read as a bank account; budget totals say "Overall, … within margin"

### Docs
- README screenshots, cover, link preview and PDF image redone from 2.2.0

## [2.1.0] — 2026-10-15

The third pass of the visual review: less dashboard boilerplate, one clear subject per screen, and the review flow that learns.

### Added
- **"Always apply"** — when you change a category while reviewing, the app offers to use it for every installment of that purchase and for future ones with the same description; the rule is saved per user (`POST /api/v1/category-rules`, stored in the merchant cache) and is used by the categorization queue and by the import preview, where it shows as "Rule"
- **Goal identity** — savings goals have their own color and icon, chosen in the form, and say when they will be reached at the current pace (`color` and `icon` on goals, migration v2.2 in `docs/migrations.sql`)
- **Icon picker** for custom categories, with a live preview of the pill

### Changed
- **Sign-in** — the preview is the main element and ends in a small flow: money in → categories → left over
- **Variations** — up and down arrows are neutral below ±5% and show the amount next to the percentage; color is kept for changes that matter
- **Dashboard** — the pace chart scales to what was spent so far; the forecast is gray and the net-worth point is wine; the empty state shows a faded outline of the real dashboard instead of a grid of cards
- **Reports** — month by month scales to the data and points out the period that strays most from the average; the comparison draws the previous period as a dashed outline; tables group the previous period and add the change in spending; percentages use one decimal and say their base; small income sources are grouped
- **Transactions** — on phones, "New" is the only filled button and the first transaction appears higher; the month pill holds every period option; the New/Edit form starts with a large amount; the import review is grouped by day at one width; installments of the same purchase are one row while reviewing
- **Profile** — the identity card shows account facts; edit and delete appear on hover
- **Investments** — the chart axis shows start and end, the largest holding replaces repeated counts, and the distribution is a list with small bars
- **Empty states** — no more icon in a box; one primary action per screen and, where it helps, a faded preview of what will appear
- "Other" given by the AI when nothing fits counts as uncategorized everywhere (lists, reports, PDF and spreadsheets)

### Fixed
- Modal headers get a divider when the content scrolls, and the close button keeps 40 px on phones
- 22 more backend tests (185 in total)

## [2.0.1] — 2026-10-14

A visual review of every screenshot of the app (976 photos: each screen, modal and state at 1366 and 375 pixels, dark and light, in Portuguese and English) and the fixes it found.

### Fixed
- **Budget pace** — "over pace" no longer shows in green: within the 5% margin it is neutral; closed months show what was left and which budgets went over, with no pace marks
- **Phones** — the pace pill no longer covers the budget ceiling label, monthly net labels no longer overlap, and the investment result pill is no longer cut off
- **Dashboard loading** — the skeleton follows the real layout
- **To review** — the chip, the review list and the summary count the same transactions
- **Transfers** — a transfer between your own accounts is one row ("Nubank → Sicredi Poupança") with a neutral amount; deleting it removes both sides
- **All time** in Transactions no longer reopens on the current month
- **AI summary** — percentages say their base, a note appears when the numbers changed since the summary was written, and Refresh writes a new one (`refresh` in the API, which now also returns the income and expenses it used)
- **Flow** — the income source is labeled even when there is only one
- **PDF report** — the monthly chart matches the app (neutral bars, income line, left-over label, current month outlined), one leading number replaces the four equal cards, the app logo is in the header and every category keeps its color

### Changed
- Helper text, axes and secondary labels reach 4.5:1 contrast in both themes; cents are never smaller than 11 px
- Health is violet instead of pink (it was close to the wine used for "Left over"); account marks use a soft tint of the bank color
- Touch targets of at least 40 px on phones
- One tagline everywhere: "Statements in. The month explained."
- Outgoing amounts are neutral in imports and in the change history; red is kept for overspending and errors
- **DOM audit** — `frontend/scripts/fotos/auditar-dom.mjs` replays every screenshot scenario and fails on overlapping or cut text, elements off screen and text below AA contrast
- The screenshot script updates the folder report on partial runs instead of replacing it; two scenarios that produced identical photos were removed (480 photos per language)
- 1 more backend test (163 in total); 38 unused translation keys removed

## [2.0.0] — 2026-10-14

A finishing pass over every screen, modal, export and state, in both themes and on phones.

### Added
- **In-browser demo** — the demo runs entirely in the browser, with fictitious data relative to today; it no longer depends on a live database ([ADR 0006](docs/adr/0006-in-browser-demo.md))
- **Budgets screen** — create, edit, delete and copy monthly budgets per category (the API existed, the screen did not)
- **Excel export** — real `.xlsx` workbooks for transactions and reports, written without a new dependency
- **Vector PDF report** — selectable text, tables and charts drawn with jsPDF, plus a print stylesheet for A4
- **AI categorization badge** — each transaction shows whether it was categorized by a rule, the merchant cache or AI, with confidence
- **English everywhere** — every screen, date and amount follows the chosen language
- **Error log** — `errosRegistrados()` in the browser console lists JS errors, rejected promises, `console.error`, missing resources and missing translations
- **Screenshot script** — captures every screen, modal and empty state at 1366 and 375 pixels in both themes, and fails on any logged error
- **Month flow on the Dashboard** — income split into spending categories and what was left, drawn as a flow; click a category to see its transactions
- **How much I can still spend** — spending this month against the pace of the budgets; fixed bills (last month's recurring expenses) count on the day they are due
- **Budgets by pace** — each budget shows where spending should be today and whether it is on pace, over pace or over budget
- **Stable category colors** — each default category keeps one color, validated for color-vision deficiency, on every screen, in the PDF and in Excel
- **Rules layer in the categorization worker** — fixed rules for known merchants run before the merchant cache and Claude Haiku (before this release the rules only existed in the demo)
- **Hide amounts** — one click blurs every amount, for use in public and in screenshots
- **404 page**, per-screen tab titles, and the browser language picked on the first visit
- **Reports in sections** — Flow (where the money went, from income sources to categories), Month by month, Categories and Projection; the section stays in the address and all of them print
- **To review** — transactions with no category, or categorized by AI with less than 85% confidence, gathered in one list; confirm each with one click or mark them all as reviewed (`needs_review` in the API)
- **Suggested category on import** — the PDF and OFX preview shows the category suggested by the fixed rules, with its confidence, and it can be changed before saving; the bulk import accepts the reviewed category and checks it belongs to the user
- **Contrast check** — `frontend/scripts/checar-contraste.mjs` measures every pill and badge in the browser and fails below 4.5:1 or 12 px, in both themes
- **26 more backend tests** (162 in total) for the budget pace and the *fixed · paid* status, spending-limit goals by pace, the review filter, suggestions on import and categories in bulk imports

### Changed
- New design system: tokens for light and dark, shared components, icon set, AFN SYSTEMS brand per the brand guide
- Sign-in screen split in two, with a live product preview and the demo as the main action
- Dashboard, Transactions, Reports, Goals, Investments and Profile redesigned
- Chart palette validated for color-vision deficiency
- Motion system: one entrance per screen, charts that draw once, a sliding tab indicator; everything respects reduced motion
- Navigation grouped by intent on the computer; five items and the profile behind the avatar on phones
- Transactions open on the current month, with month-by-month navigation and a one-line summary
- Reports: the period's surplus is the main number; spending by category as a stacked bar and a ranked list instead of a donut; spending drawn in neutral gray
- Comparisons for the current month use the same days of the previous month
- The demo month is partial, like a real one, instead of squeezing the whole month into the first days
- "Income" and "Expenses" (Receitas and Gastos) used everywhere, including exports
- Fonts served by the app itself (no Google Fonts)
- End-to-end tests run against a local build of the demo (40 tests, desktop and phone)
- One budget status everywhere: the alert, the bar, the pill and the summary sentence come from the same rule, including *fixed · paid* for categories that are almost all fixed bills already paid; budget alerts in the API follow that rule instead of fixed 80% and 100% thresholds
- Alerts grouped by subject, each with an action (see budgets, categorize, see history)
- One way of drawing money across the app: smaller cents in the number's own color
- Category palette without green (green is kept for status), revalidated for color-vision deficiency in both themes
- Reports: month by month drawn as neutral spending bars with income as a tick and the surplus labeled above; "today" line on the projection
- Transactions: filters as chips, rows with a fixed height; pills and badges at 12 px; edit and delete on hover, in a "⋯" menu on touch screens
- Profile with an identity header and the theme picked from previews; a savings goal shows its own color band

### Security
- The API checks the owner of every account and category before writing; undo takes the owner from the token, never from the history
- JWT validation with fixed algorithms, audience and required expiry (python-jose replaced by PyJWT)
- The categorization worker only reads the queue owner's transaction and only offers that user's own and the default categories
- Direct database access is read-only for users; a user can never create a "default" category
- Content-Security-Policy without inline scripts, frame-ancestors, nosniff, Referrer-Policy and Permissions-Policy
- Upload and bulk limits, per-user rate limits, constant-time comparison of the internal secret, strong secrets required in production
- Dependencies updated with no known advisories (npm audit and OSV); Dependabot configured
- 49 new backend tests, including two-user authorization tests on an in-memory database

### Fixed
- Recurring payments are no longer reported as missing before the day they usually arrive
- A budget whose fixed bills are already paid (rent at 99% of housing, for example) no longer raises an alert next to an "on pace" bar
- Transfers between your own accounts no longer appear as income and spending in the cash-flow projection
- The three-month projection uses 12 months of history
- On phones, toasts no longer cover the confirm button of a bottom sheet
- Transfers between your own accounts no longer count as income and spending
- The cash-flow projection no longer repeats installments of the same purchase
- Projections no longer use the current, incomplete month for averages
- AI summaries no longer show raw markdown
- Amounts formatted as "R$ 16.4k" and dates as "11-01" replaced by locale-aware formats

## [1.4.0] — 2026-06-03

### Added
- **Net worth tracking** — historical snapshots with sparkline chart
- **Cashflow projections** — 12-month forward projection based on recurring transactions
- **Audit log with undo** — every destructive action is logged and reversible
- **Budget progress card** — dashboard card showing budget consumption with 80%/100% threshold alerts
- **Backend tests** — 57 tests (38 for helpers, 19 API tests with a mocked Supabase) covering the critical backend paths (accounts, transactions, transfers, OFX parse, summary, cashflow, net worth, budget alerts)

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

## [1.2.0] — 2026-06-02

### Added
- **Transfers** — double-entry transfers between accounts, the two sides linked by a shared `import_batch_id`
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

## [1.1.0] — 2026-06-01

### Added
- **AI categorization worker** — non-blocking pipeline: merchant cache, then Claude Haiku with prompt caching
- **Investments** — manual portfolio tracking grouped by asset type with profitability metrics
- **Reports** — donut chart by category, monthly bar chart, top 5 expenses, custom date range
- **Password reset** — forgot password flow with PKCE-safe recovery redirect
- **Accounts UI** — create, rename, delete accounts; balance auto-adjusted on transaction changes
- **Demo mode** — pre-seeded account with weekly auto-reset via GitHub Actions (Monday 06:00 UTC)
- **CI/CD** — GitHub Actions pipeline (typecheck + Vite build) on every push; auto-deploy to Vercel and Railway on `main`

### Fixed
- Dashboard 6-month sparkline aligned to correct months
- Supabase PKCE recovery token race condition on password reset

## [1.0.0] — 2026-05-29

### Added
- **Dashboard** — monthly metrics (balance, income, expenses) + 6-month net-balance sparkline
- **Transactions** — paginated list with filters (debounced search, collapsible on mobile), inline category edit, CSV export
- **Goals** — spending limits and savings targets with progress bars
- **Dark / light mode** — persisted in localStorage
- **Offline queue** — transactions created offline sync on reconnect via Dexie.js (IndexedDB); uses `window.addEventListener('online')` + health-check ping (no Background Sync API — Safari iOS compat)
- **JWT authentication** — ES256 + HS256 fallback, JWKS with 1-hour cache, `kid`-based key lookup
- **Row Level Security** — Supabase RLS as a second defense layer; service role used only in backend
- **Structured logging** — structlog with JSON output; Sentry for error monitoring
