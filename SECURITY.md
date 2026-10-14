# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | ✅         |
| 1.x     | ❌         |

## Reporting a Vulnerability

If you discover a security vulnerability in FlowTrack, please **do not open a public GitHub issue**.

Send a private report to: **alyssom1919@gmail.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

You will receive a response within 48 hours. Once confirmed, a fix will be released as soon as possible and you will be credited (unless you prefer to remain anonymous).

## Security Measures

- **Authentication**: Supabase Auth with PKCE flow. The API validates the JWT itself: a fixed list of algorithms (ES256/RS256 from the project's JWKS, HS256 with the project secret), audience `authenticated`, and required `exp` and `sub`. The token never chooses its own algorithm.
- **Authorization**: the API talks to the database with the `service_role` key, which bypasses Row Level Security. Every route therefore filters by the user taken from the token, and every account or category id that arrives in a request is checked for ownership before anything is written (`backend/app/api/v1/_helpers.py`). Tests with two users cover this (`backend/tests/test_security.py`).
- **Row Level Security**: enabled on every table. The `authenticated` role (anyone with the public anon key and an account) can only read its own rows; every write goes through the API, so nobody can bypass its checks by calling the Supabase REST endpoint directly. A "default" category is `is_default = true` with no owner; a user-created category can never become one.
- **Categorization worker**: three layers (fixed rules, the user's merchant cache, Claude Haiku). For each queue item it only reads the item owner's transaction and only offers that user's own and the default categories, so one user's category names never reach another user's prompt or transactions.
- **Internal endpoints**: protected by a separate secret, compared in constant time.
- **Input limits**: uploads above 10 MB are refused (413); bulk imports take at most 2,000 rows; request bodies without a declared length are refused (411). Rate limits on AI, import and bulk endpoints (slowapi) count per user for authenticated calls, and otherwise per the IP the platform proxy appends (never the client-supplied part of `X-Forwarded-For`).
- **Secrets**: in production the API refuses to start with example values or secrets shorter than 32 characters.
- **Web app headers**: Content-Security-Policy without inline scripts and with `connect-src 'self'`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy` (see `vercel.json`). Fonts are served from the app itself. The public deployment runs only the in-browser demo; to connect a real Supabase project and API, add their exact hosts to `connect-src`.
- **Secrets management**: all credentials via environment variables; never committed to the repository.
- **Dependencies**: Dependabot for npm, pip and GitHub Actions (`.github/dependabot.yml`).
- **Error handling**: generic error messages; `/health` returns only `{"status": "ok"}`.

## Past incident

In May 2026 a `backend/.env` file with a Supabase service key was pushed by mistake (commit `ec866f6`). The history was rewritten and the Supabase project that key belonged to has since been deleted, so the key no longer grants access to anything. Any new project uses new keys.

## Known Limitations

- Balance updates are a read followed by a write, not a single database transaction. Two writes to the same account at the same instant can lose one update. Undo reserves the history entry first, so the same entry cannot be undone twice.
- PDF parsers rely on bank-specific output formats and may break if banks change their PDF generators.
