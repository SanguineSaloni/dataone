"""High-level DataOne + ACI integrations demo.

The default mode is presentation-only and performs no network calls or
external side effects.  ``--live`` signs in to a running DataOne API and
reads the currently shipped integration status, linked accounts, and
notification settings.

Run from the backend directory:

    python run_integrations_demo.py
    DATAONE_DEMO_PASSWORD='...' python run_integrations_demo.py --live

The live demo is intentionally read-only. External messages, tickets, email,
and Slack notifications remain behind DataOne's governed execution paths.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_API_URL = "http://localhost:8011/api/v1"
DEFAULT_EMAIL = "admin@dataplane.ai"


def _heading(number: int, title: str) -> None:
    print(f"\n{number}. {title}")
    print("-" * (len(title) + 3))


def _request(
    url: str,
    *,
    method: str = "GET",
    token: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = Request(url, data=body, headers=headers, method=method)
    with urlopen(request, timeout=10) as response:  # noqa: S310 - operator-supplied URL
        return json.loads(response.read().decode("utf-8"))


def _print_governed_actions(actions: list[dict[str, Any]]) -> None:
    if not actions:
        print("  No governed actions were returned.")
        return
    for action in actions:
        mode = "auto-capable" if action.get("auto_capable") else "approval required"
        print(
            f"  • {action.get('action_type', 'unknown')}: "
            f"{action.get('risk', 'unknown')} risk, {mode}"
        )


def presentation() -> None:
    """Describe every integration capability without executing anything."""
    print("DataOne Integrations — High-Level Demo")
    print("======================================")
    print("Purpose: connect external applications through ACI while DataOne keeps")
    print("authorization, approval, tenant isolation, and audit control.")

    _heading(1, "Integration health and configuration")
    print("  Show whether ACI is configured and where administrators connect apps.")
    print("  ACI remains optional: an outage must not stop core DataOne workflows.")

    _heading(2, "App and function discovery")
    print("  Search ACI's catalog and inspect function definitions at a high level.")
    print("  Discovery is read-only and must pass through the DataOne backend.")

    _heading(3, "Linked accounts")
    print("  Review connected apps and enabled state without exposing OAuth tokens.")
    print("  Subscriber rollout requires each account to be scoped to its tenant owner.")

    _heading(4, "Governed external actions")
    print("  • Internal Slack notification — fixed admin-configured destination")
    print("  • External message — approval required")
    print("  • Ticket or issue creation — approval required")
    print("  • Email delivery — approval required")
    print("  DataOne never exposes an execute-any-function endpoint to the browser.")

    _heading(5, "Event notifications")
    print("  Administrators opt specific events in or out of asynchronous notify-out.")
    print("  Notification failure is audited but never rolls back the business event.")

    _heading(6, "Approval, execution, and audit")
    print("  User request → allow-list validation → human approval when required →")
    print("  ACI execution → DataOne Audit Trail with actor, destination, and outcome.")

    _heading(7, "Security boundary")
    print("  Browser → DataOne API → ACI SDK/API → external application")
    print("  ACI keys and linked-account credentials stay server-side.")
    print("  Tenant and owner identifiers come from authenticated backend context.")

    print("\nPresentation complete. No external action was executed.")


def live_demo(api_url: str, email: str, password: str) -> None:
    """Read the live DataOne integration surfaces; never mutate or execute."""
    base = api_url.rstrip("/")
    print("\nLive read-only verification")
    print("===========================")

    login = _request(
        f"{base}/auth/login",
        method="POST",
        payload={"email": email, "password": password},
    )
    token = login["access_token"]
    print(f"Authenticated as {login.get('email')} ({login.get('role')})")

    status = _request(f"{base}/integrations/status", token=token)
    print(f"ACI configured: {'yes' if status.get('configured') else 'no'}")
    print(f"ACI portal: {status.get('portal_url') or 'not configured'}")
    print("Governed actions:")
    _print_governed_actions(status.get("external_actions", []))

    linked = _request(f"{base}/integrations/linked-accounts", token=token)
    accounts = linked.get("accounts", [])
    print(f"Linked accounts: {len(accounts)}")
    for account in accounts:
        print(
            f"  • {account.get('app_name') or 'unknown app'} — "
            f"{'enabled' if account.get('enabled') else 'disabled'}"
        )
    if linked.get("error"):
        print(f"  Availability note: {linked['error']}")

    if login.get("role") == "admin":
        settings = _request(f"{base}/integrations/notification-settings", token=token)
        rows = settings.get("settings", [])
        print(f"Notification policies: {len(rows)}")
        for row in rows:
            state = "enabled" if row.get("enabled") else "disabled"
            print(f"  • {row.get('event_key')}: {state}")
    else:
        print("Notification policies: admin-only; skipped for this account.")

    print("Live verification complete. No settings or external systems were changed.")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Present and optionally verify DataOne's ACI integration at a high level."
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="also call the running DataOne API using read-only requests",
    )
    parser.add_argument(
        "--api-url",
        default=os.getenv("DATAONE_API_URL", DEFAULT_API_URL),
        help=f"DataOne API v1 base URL (default: {DEFAULT_API_URL})",
    )
    parser.add_argument(
        "--email",
        default=os.getenv("DATAONE_DEMO_EMAIL", DEFAULT_EMAIL),
        help=f"login email for --live (default: {DEFAULT_EMAIL})",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    presentation()
    if not args.live:
        return 0

    password = os.getenv("DATAONE_DEMO_PASSWORD")
    if not password:
        print("\nError: --live requires DATAONE_DEMO_PASSWORD.", file=sys.stderr)
        return 2
    try:
        live_demo(args.api_url, args.email, password)
    except HTTPError as exc:
        print(f"\nLive verification failed: DataOne returned HTTP {exc.code}.", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, json.JSONDecodeError, KeyError) as exc:
        print(f"\nLive verification failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
