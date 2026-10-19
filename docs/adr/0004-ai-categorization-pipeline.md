# ADR 0004 — 3-Layer AI Categorization Pipeline

**Date:** 2026-05-01  
**Status:** Accepted

## Context

Transactions need to be categorized. A naive approach would call Claude for every transaction. The cost and latency of that approach are unacceptable for a personal finance app with potentially hundreds of transactions per import.

## Decision

Implement a 3-layer pipeline:

1. **Deterministic rules** — regex/pattern matching for known payees (supermarkets, utilities, etc.)
2. **Merchant cache** — if the same normalized merchant has been categorized before, reuse that decision
3. **Claude Haiku** — only for merchants not covered by layers 1 and 2. The model answers through a forced tool call (`categorize`) with a category from the user's allowed list and a confidence from 0 to 1. The worker validates both: a category outside the list leaves the transaction uncategorized, and a missing or out-of-range confidence is stored as 0. The stored confidence decides the review: below 0.85 the transaction goes to **To review**, and only answers at or above 0.85 are written to the merchant cache.

The pipeline runs asynchronously in a background worker triggered by `cron-job.org` every 5 minutes, not at import time.

## Reasons

- **Cost**: Layer 1 and 2 have zero API cost. Layer 3 uses Claude Haiku. The system prompt is marked with `cache_control`, but Anthropic only caches a prompt above a minimum length that depends on the model, and this one (instructions plus the category list) is short, so the cache may never apply. It has not been measured: the worker logs `cache_read_input_tokens` and `cache_creation_input_tokens` for every call, which shows whether it does.
- **Latency**: Import is instant — the user sees transactions immediately with a "pending" categorization badge. Categorization arrives within minutes.
- **Hit rate**: the share of transactions resolved by layers 1 and 2 is expected to grow as the merchant cache fills. It has not been measured.
- **Isolation**: each queue item only reads its owner's transaction and only offers the default categories and that user's own, so one user's category names never reach another user's prompt.

## Consequences

- Transactions are temporarily uncategorized after import. The UI shows a "pending" state.
- The cron job must be configured externally (cron-job.org) — it is not self-hosted.
- If the Anthropic API is unavailable, transactions remain uncategorized until the next cron run.
