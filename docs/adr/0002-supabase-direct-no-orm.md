# ADR 0002 — Direct Supabase Client, No ORM

**Date:** 2026-05-01  
**Status:** Accepted

## Context

The backend needed a way to interact with PostgreSQL. Options considered: SQLAlchemy (full ORM), Tortoise ORM (async), Prisma (via Python client), or the Supabase Python client directly.

## Decision

Use `supabase-py` (the official Supabase client) directly in all route handlers. No ORM layer.

## Reasons

- **RLS as the security layer**: Supabase's Row Level Security policies are defined in PostgreSQL. An ORM that generates raw SQL would bypass or complicate RLS unless explicitly wired. The Supabase client runs queries through the PostgREST API, which applies RLS automatically.
- **Schema ownership**: The schema lives in `docs/schema.sql` and is managed in Supabase Studio. An ORM would introduce a competing schema definition that must be kept in sync.
- **Complexity**: For a single-user app with a fixed schema, the query builder API of `supabase-py` is sufficient. Full ORM features (lazy loading, relationships, migrations) add overhead without benefit.

## Consequences

- No type-safe query builder — queries return raw dicts that must be cast.
- No migration tooling from the Python side — schema changes are applied manually in Supabase Studio and reflected in `docs/schema.sql`.
- Adding Alembic later would require significant scaffolding to work alongside the existing approach.
