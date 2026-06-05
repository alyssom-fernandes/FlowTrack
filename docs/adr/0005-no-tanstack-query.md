# ADR 0005 — Manual Data Fetching, No TanStack Query

**Date:** 2026-05-01  
**Status:** Accepted

## Context

React applications typically use a server-state library (TanStack Query, SWR) to handle caching, background refetches, and loading states.

## Decision

Fetch data manually in `useEffect` hooks using the Axios service layer. No TanStack Query or SWR.

## Reasons

- **Single-user, single-session**: There is no multi-tab invalidation problem. The user has one session. Stale data from a previous navigation does not require background refetching.
- **Offline queue**: The offline queue (Dexie) already manages the write path. Adding TanStack Query would create a competing cache for the read path, requiring explicit synchronization between the two.
- **Simplicity**: The fetch patterns in this app are uniform: load on mount, optionally reload on filter change. `useEffect` + `useState` is sufficient without the abstraction overhead.
- **Bundle size**: TanStack Query adds ~13 kB gzipped. Not a deciding factor but relevant for a PWA.

## Consequences

- No automatic background refetch — data is stale until the user navigates away and back.
- Loading and error states are managed manually per component.
- Adding optimistic updates (e.g., for offline transactions) requires manual state management rather than the built-in mutations API.
