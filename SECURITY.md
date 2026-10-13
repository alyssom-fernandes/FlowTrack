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
- **Row Level Security**: enabled on every table for direct access with the public anon key. The change history (`audit_log`) is read-only for users; only the API writes it. Global rows of the merchant cache can only be written by the API.
- **Internal endpoints**: protected by a separate secret, compared in constant time.
- **Input limits**: uploads above 10 MB are refused (413); rate limits on AI and import endpoints (slowapi), with the client IP taken from the platform proxy.
- **Web app headers**: Content-Security-Policy without inline scripts, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy` (see `vercel.json`). Fonts are served from the app itself.
- **Secrets management**: all credentials via environment variables; never committed to the repository.
- **Dependencies**: Dependabot for npm, pip and GitHub Actions (`.github/dependabot.yml`).
- **Error handling**: generic error messages; `/health` returns only `{"status": "ok"}`.

## Past incident

In May 2026 a `backend/.env` file with a Supabase service key was pushed by mistake (commit `ec866f6`). The history was rewritten and the Supabase project that key belonged to has since been deleted, so the key no longer grants access to anything. Any new project uses new keys.

## Known Limitations

- Balance updates are a read followed by a write, not a single database transaction. Two writes to the same account at the same instant can lose one update.
- PDF parsers rely on bank-specific output formats and may break if banks change their PDF generators.
