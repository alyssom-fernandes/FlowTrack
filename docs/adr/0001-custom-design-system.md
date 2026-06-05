# ADR 0001 — Custom Design System over Shadcn/Tailwind

**Date:** 2026-05-01  
**Status:** Accepted

## Context

The project needed a UI component library and styling approach. The most common choices in the React ecosystem are Tailwind CSS with Shadcn/ui, or a component library such as MUI or Chakra.

## Decision

We built a custom design system in `frontend/src/tokens.css` using CSS custom properties, with components in `frontend/src/components/ui.tsx`.

## Reasons

- **Identity**: The brand uses a specific accent color (`#9D2449`), a custom typographic scale, and a dark-first theme. A utility-class approach would require per-element overrides that erode the constraint.
- **Portability**: Pure CSS tokens work in any framework. No Tailwind config, no PostCSS pipeline, no JIT purging to maintain.
- **Size**: Zero runtime CSS-in-JS. The final stylesheet is a single pre-processed file.
- **Learning signal**: Portfolio projects that reach for standard scaffolding look assembled, not authored. A custom system demonstrates understanding of how design tokens work at the implementation level.

## Consequences

- New contributors must learn the token names instead of utility classes.
- No ready-made component catalogue — each new component is built from scratch.
- Shadcn/Tailwind is the industry standard in 2025–2026; this choice may raise questions in code reviews.

## Mitigations

The token system is documented in `docs/architecture.md`. The set of components is small and stable for a single-user personal finance app.
