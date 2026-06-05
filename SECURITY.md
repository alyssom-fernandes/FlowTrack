# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅         |

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

- **Authentication**: Supabase Auth with PKCE flow, JWT (ES256/HS256) validated server-side via JWKS
- **Authorization**: Row Level Security (RLS) enforced at the database layer for all user data
- **API security**: Bearer token required on all endpoints; internal endpoints protected by a separate secret token
- **Rate limiting**: Applied on AI and import endpoints (slowapi)
- **Secrets management**: All credentials via environment variables; never committed to the repository
- **Error handling**: Generic error messages in production to avoid information leakage
- **Transport**: HTTPS enforced on all production services (Vercel + Railway)

## Known Limitations

- This is a single-user personal finance app. Multi-tenancy hardening is out of scope for v1.
- PDF parsers rely on bank-specific output formats and may break if banks change their PDF generators.
