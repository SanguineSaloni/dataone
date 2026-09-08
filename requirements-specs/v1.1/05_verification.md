# Task 05 — Verify and document v1.1

Run frontend tests, TypeScript, lint, and the production build. Update the epic index and `MEMORY.md` with honest results and any security caveat.

Host-facing development endpoints are `http://localhost:3011` for DataOne and `http://localhost:8011` for the API. Container-internal nginx/FastAPI ports remain `3000`/`8000`.

Docker resources use the `dataone` namespace: custom images `dataone-backend`, `dataone-frontend`, and optional `dataone-aci`; containers `dataone-*`; network `dataone-network`; and persistent volumes `dataone-*`.
