# Task 06 — Dual-Identity and Marketplace Architecture

## Decision

DataOne will support two explicitly separated identity lanes:

1. **Publisher lane:** Veltris workforce identities only, authenticated against the single Veltris Microsoft Entra tenant.
2. **Subscriber lane:** customer workforce identities authenticated through a publisher-verified, multitenant Microsoft Entra application and authorized only inside their provisioned DataOne tenant.

Both lanes terminate at the FastAPI backend, which issues the DataOne application session only after identity, tenant, role, and subscription checks succeed. The root `auth.ts` is a useful MSAL flow prototype, but it must not become a separate Express authentication authority beside FastAPI.

## Trust boundaries

```text
Veltris employee
  -> single-tenant Entra publisher app
  -> OIDC callback
  -> validate issuer/audience/nonce/state + exact Veltris tid
  -> map (tid, oid) to publisher user + publisher app role
  -> DataOne publisher session

Subscriber user / Marketplace buyer
  -> verified multitenant Entra subscriber app
  -> OIDC callback or Marketplace landing page
  -> validate issuer/audience/nonce/state
  -> map immutable (tid, oid) to provisioned customer tenant
  -> require active/trial Marketplace entitlement
  -> map approved app role/group/local membership
  -> DataOne subscriber session
```

Publisher and subscriber routes, app registrations, redirect URIs, role namespaces, and audit events remain distinct. A subscriber identity can never acquire publisher privileges, including when invited as a guest into the Veltris directory. Publisher access requires the exact Veltris tenant ID, an immutable object ID allow-list or assignment, and a publisher app role.

## Application registrations

### Publisher registration

- Audience: accounts in the Veltris directory only.
- Authority: tenant-specific Veltris authority; never `/common`.
- Assignment required; publisher app roles such as `Publisher.Support`, `Publisher.Operations`, and `Publisher.Admin`.
- MFA and Conditional Access enforced in Entra; break-glass access is separately audited.
- Redirect URIs limited to publisher callback paths and exact deployment origins.

### Subscriber registration

- Audience: organizational directories required for normal workspace SSO.
- Publisher domain must be DNS verified and the app associated with Veltris's Microsoft AI Cloud Partner Program Partner One ID to obtain verified-publisher status.
- Request only minimal OIDC scopes for initial login. Microsoft Marketplace landing must not demand admin consent for initial configuration.
- Additional Graph permissions use incremental/admin consent only when an approved feature requires them.
- Marketplace activation can accept the purchaser identity types Partner Center requires, but activation does not itself grant workspace access. Normal DataOne access requires a provisioned subscriber organization and authorized workforce identity.

## Backend session model

- FastAPI owns authentication callbacks and authorization. Do not introduce an Express sidecar solely for `auth.ts`.
- Prefer an opaque, rotated, server-side session referenced by `Secure`, `HttpOnly`, `SameSite=Lax` cookies. If cross-site Marketplace landing constraints require `SameSite=None`, restrict it to the minimum callback cookie and require `Secure`.
- Store session records in a production session store with expiry and revocation; do not use MemoryStore or browser `localStorage` for the final SSO session.
- Regenerate the session identifier after login, logout server-side, clear cookies using identical attributes, and enforce CSRF protection on cookie-authenticated mutations.
- No fallback session secret. Signing/encryption keys come from the configured secret manager and support rotation.

## Identity and authorization model

Minimum durable records:

- `tenants`: internal ID, name, status, Entra tenant ID, marketplace customer/subscription relationship.
- `external_identities`: provider, immutable issuer/tenant ID, immutable object ID, internal user ID, last-login metadata.
- `tenant_memberships`: user ID, tenant ID, DataOne role, status, provisioning source.
- `publisher_memberships`: user ID, approved publisher role, status; never inferred from email domain.
- `marketplace_subscriptions`: subscription ID, offer ID, plan ID, quantity, purchaser/customer IDs, beneficiary IDs, status, term, etag/version, timestamps.
- `marketplace_operations`: event/operation ID, correlation ID, payload digest, processing state, attempts, last error.

Authorization uses validated `tid` and `oid` as the external identity key. Email, UPN, and display name are display/recovery attributes only and never authorize access. Every customer-owned query must include the internal tenant scope, and the database must enforce that scope where practical.

## Marketplace partnership protocol

For a transactable SaaS offer:

1. Partner Center sends the buyer to the configured landing page with a Marketplace token.
2. The backend authenticates the buyer with minimal-consent Entra SSO and resolves the purchase token using SaaS Fulfillment API v2.
3. DataOne creates or links the customer tenant and a pending entitlement using Microsoft-returned identifiers; client-supplied plan/customer identifiers are not trusted.
4. After configuration, the backend activates the subscription when explicit activation is configured. Auto-activation plans skip this call.
5. A backend-only webhook accepts plan, quantity, suspend, reinstate, and unsubscribe events. Processing is authenticated, idempotent, replay-safe, ordered/version-aware, retried, and fully audited.
6. Access follows local entitlement state: `Subscribed`/eligible trial allows access; `Suspended` enters the approved restricted/read-only policy; `Unsubscribed` revokes new sessions and terminates existing sessions according to retention policy.
7. Plan/seat changes become effective locally only at the protocol-defined completion point. Correlation and request IDs are retained for support.
8. Marketplace APIs are called service-to-service from the backend only, never from the browser.

Optional SCIM provisioning is a separate subscriber lifecycle layer; it never replaces Marketplace entitlement checks.

## Threat controls

- OIDC authorization-code flow with PKCE where supported; validate state, nonce, issuer, signature, audience, timestamps, tenant, subject, and authorized client/actor.
- Reject unknown tenants before creating an application session except inside the constrained Marketplace activation flow.
- Prevent account-linking by email. Re-linking an immutable identity requires an audited admin recovery flow.
- Rate-limit login, callback, activation, webhook, and SCIM endpoints.
- Redact authorization codes, tokens, secrets, session IDs, and Marketplace purchase tokens from logs.
- Use allow-listed post-login return paths; never redirect to a user-supplied absolute URL.
- Audit login success/failure, consent, tenant provisioning, role changes, subscription transitions, logout, and publisher impersonation/support access.
- Publisher support access to subscriber data must be explicit, time-bound, reason-coded, customer-visible where required, and never implied by publisher login.

## Rollout gates

No runtime implementation may be marked complete until:

- tenant isolation is implemented and adversarially tested;
- Veltris tenant ID, Partner One ID, verified domain, app registrations, and redirect URI inventory are approved;
- the Marketplace offer model (transactable/free/trial, plans, seats, metering) is fixed;
- security reviews the threat model, session design, recovery, support access, and webhook verification;
- legal/privacy approves subscriber claims, retention, telemetry, and marketplace terms;
- Partner Center technical validation passes in a non-production environment.

## Official protocol references

- [Microsoft Marketplace SaaS Fulfillment API flows](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-apis)
- [Microsoft Entra ID and transactable SaaS offers](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/azure-ad-saas)
- [SaaS Fulfillment Subscription APIs v2](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api)
- [Microsoft identity claims validation](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation)
- [Microsoft publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
