# Task 08 — Veltris Publisher Identity Lane

Implement tenant-specific Microsoft Entra OIDC for Veltris workforce users. Require the exact approved Veltris `tid`, immutable user identity assignment, publisher app role, MFA/Conditional Access policy, and a separate `/publisher` authorization boundary.

Subscriber tenant roles must never satisfy publisher authorization. Publisher support access to customer data requires a separate, time-bound, audited elevation workflow.

## Status

`[!]` Blocked pending approved Veltris tenant/app registration values and security review.
