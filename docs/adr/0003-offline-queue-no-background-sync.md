# ADR 0003 — Offline Queue via Dexie.js, Not Background Sync API

**Date:** 2026-05-01  
**Status:** Accepted

## Context

The app is a PWA that must support creating transactions while offline and syncing them when connectivity returns. The Web Background Sync API was the obvious choice.

## Decision

Implement the offline queue using Dexie.js (IndexedDB wrapper) with a foreground-triggered sync on the `online` event + a health-check ping before flushing.

## Reasons

- **Safari iOS compatibility**: Background Sync API is not supported on iOS Safari as of 2026 (only available behind a flag). Since the app targets PWA on iOS, this is a non-starter.
- **Predictability**: A foreground queue is easier to reason about. The sync happens when the user has the app open, not silently in the background.
- **Retry logic**: We implement exponential backoff (1 min → 3 min → 9 min, max 3 retries) manually, which is more flexible than the browser's built-in retry schedule.

## Consequences

- Transactions created offline are synced only when the user opens the app while online.
- If the user never opens the app again after going offline, the queue is never flushed (acceptable for a personal finance app — data is on-device).
- No background sync means no server-side processing of queued items without the app being open.
