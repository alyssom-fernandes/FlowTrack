# ADR 0004 — 3-Layer AI Categorization Pipeline

**Date:** 2026-05-01  
**Status:** Accepted

## Context

Transactions need to be categorized. A naive approach would call Claude for every transaction. The cost and latency of that approach are unacceptable for a personal finance app with potentially hundreds of transactions per import.

## Decision

Implement a 3-layer pipeline:

1. **Deterministic rules** — regex/pattern matching for known payees (supermarkets, utilities, etc.)
2. **Merchant cache** — if the same normalized merchant has been categorized before, reuse that decision
3. **Claude Haiku** — only for merchants not covered by layers 1 and 2

The pipeline runs asynchronously in a background worker triggered by `cron-job.org` every 5 minutes, not at import time.

## Reasons

- **Cost**: Layer 1 and 2 have zero API cost. Layer 3 uses Claude Haiku (cheapest model) with prompt caching on the system prompt.
- **Latency**: Import is instant — the user sees transactions immediately with a "pending" categorization badge. Categorization arrives within minutes.
- **Hit rate**: In practice, ~90% of transactions match layers 1 or 2 after a few weeks of use, as the merchant cache grows.

## Consequences

- Transactions are temporarily uncategorized after import. The UI shows a "pending" state.
- The cron job must be configured externally (cron-job.org) — it is not self-hosted.
- If the Anthropic API is unavailable, transactions remain uncategorized until the next cron run.
