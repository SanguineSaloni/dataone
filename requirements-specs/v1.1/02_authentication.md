# Task 02 — Centralize and enforce authentication

Move authentication behavior into `frontend/src/lib/auth.ts`, route login through the shared API layer, validate protected dashboard sessions with `/api/v1/auth/me`, show the authenticated identity, and centralize logout.

## Acceptance criteria

- Unauthenticated dashboard visits redirect to login before protected content renders.
- Invalid/expired tokens use the existing centralized 401 handling.
- Login no longer calls `fetch` from a page component.
- Dashboard identity is sourced from the backend, not a static admin label.

## Caveat

Human security review is still required before production release.
