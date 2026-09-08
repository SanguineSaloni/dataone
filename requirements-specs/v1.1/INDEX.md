# DataOne v1.1 — Brand, Authentication, and Dashboard

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Implemented and verified
- `[!]` Blocked; requires human/security sign-off
- `[?]` Product decision required

## Priority order

| # | Status | Priority | Task | Confidence |
|---|---|---|---|---|
| 1 | `[x]` | P0 | [Rename the product to DataOne](01_dataone_brand.md) | High — presentation-only frontend change. |
| 2 | `[!]` | P0 | [Centralize and enforce authentication](02_authentication.md) | Implementation verified; production security sign-off remains required. |
| 3 | `[x]` | P1 | [Upgrade dashboard context and actions](03_dashboard_upgrade.md) | High — existing live APIs cover the requested content. |
| 4 | `[x]` | P1 | [Apply the Veltris logo](04_veltris_logo.md) | High — supplied asset is available locally. |
| 5 | `[x]` | P1 | [Verify and document v1.1](05_verification.md) | Tests, TypeScript, changed-file lint, and production build passed. |
| 6 | `[x]` | P0 | [Dual-identity and Marketplace architecture](06_dual_identity_marketplace_architecture.md) | Design complete against current Microsoft protocols; no security-sensitive runtime code landed. |
| 7 | `[~]` | P0 | [Tenant isolation foundation](07_tenant_isolation_foundation.md) | Explicitly authorized 2026-07-15; implementation inventory and staged review plan launched. |
| 8 | `[!]` | P0 | [Veltris publisher identity lane](08_publisher_identity.md) | Requires Veltris tenant/app registration details and security sign-off. |
| 9 | `[!]` | P0 | [Subscriber SSO identity lane](09_subscriber_sso.md) | Depends on #7 and verified multitenant app registration. |
| 10 | `[!]` | P0 | [Marketplace fulfillment integration](10_marketplace_fulfillment.md) | Depends on Partner Center offer configuration and #7. |
| 11 | `[?]` | P1 | [SCIM subscriber lifecycle](11_scim_provisioning.md) | Recommended; product decision needed for initial marketplace release. |
| 12 | `[!]` | P0 | [Security and partnership release gates](12_security_marketplace_release.md) | Requires human security, legal, and Partner Center approval. |

## Execution order

1. Establish shared brand and authentication primitives.
2. Apply them to landing, login, and protected dashboard chrome.
3. Replace stale dashboard claims and routes with live/current context.
4. Run automated verification and record results.
5. Approve the dual-identity threat model and tenant boundary before implementing SSO.
6. Build publisher and subscriber identity lanes, then Marketplace fulfillment.
7. Complete security and partnership certification gates before release.

## Security boundary

The currently built runtime reuses the existing bearer JWT and `/api/v1/auth/me` validation endpoint. Tasks #6–#12 add the approved direction for publisher/subscriber SSO and Marketplace integration, but do not yet add SSO, cookies, fulfillment endpoints, or change backend authorization policy. Those runtime changes remain gated on tenant isolation and human security/partnership approval.

## Progress log

- 2026-07-15 — Created the v1.1 epic and began tasks #1–#4.
- 2026-07-15 — Completed #1, #3, and #4: renamed frontend product surfaces to DataOne, introduced a shared Veltris-backed brand component, and upgraded dashboard freshness/actions/live connector context.
- 2026-07-15 — Implemented #2 using the existing JWT backend: centralized login/session/logout in `frontend/src/lib/auth.ts`, added `/auth/me` validation before rendering protected dashboard content, and surfaced the authenticated user. Left `[!]` pending human production security review, per repository policy.
- 2026-07-15 — Completed #5: Vitest 129/129, TypeScript clean, changed-file ESLint clean except three pre-existing `<img>` warnings, and the production static build passed. Full-tree lint remains blocked by six pre-existing `react-hooks/set-state-in-effect` errors outside v1.1 files.
- 2026-07-15 — Added #6–#12 for dual publisher/subscriber identity and Microsoft Marketplace partnership. Architecture uses Veltris single-tenant publisher authentication, subscriber multitenant Entra SSO, immutable `tid` + `oid` authorization, and backend-only Marketplace Fulfillment API v2 lifecycle handling. Implementation is intentionally blocked until tenant isolation and human security/Partner Center inputs are approved.
- 2026-07-15 — User explicitly overrode Task #7's product-decision block and authorized application-wide tenant-isolation implementation and review. Marked #7 `[~]`; added the grounded launch plan and inventory in `07_tenant_isolation_foundation.md`. This authorizes isolation work, not automatic approval of #8–#10/#12 or use of unapproved Partner Center/Entra credentials.
