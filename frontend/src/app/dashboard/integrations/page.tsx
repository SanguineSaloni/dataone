"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, LoadingState, SeverityChip, WorkspaceHeader } from "../components";
import type { SeverityLevel } from "../components";

interface ExternalAction {
  action_type: string;
  description: string;
  risk: string;
  auto_capable: boolean;
}

interface IntegrationStatus {
  configured: boolean;
  portal_url: string;
  external_actions: ExternalAction[];
}

interface LinkedAccount {
  id: string | number | null;
  app_name: string | null;
  linked_account_owner_id: string | null;
  enabled: boolean | null;
}

interface NotificationSetting {
  event_key: string;
  enabled: boolean;
  updated_by?: string | null;
}

// Known notify-out event keys (aci_integration_tasks #5/#7) — presented even
// before a row exists so admins can discover what's configurable. Disabled
// by default: no blanket "notify everything".
const KNOWN_EVENT_KEYS = [
  { key: "agentic_dba:schema_design_create", label: "Schema design plan ready for review" },
  { key: "pipeline:run_failure", label: "Pipeline run failed" },
  { key: "pipeline:run_success", label: "Pipeline run succeeded" },
  { key: "pipeline:drift_impact", label: "Pipeline blocked by schema drift" },
];

export default function IntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, acc, ns] = await Promise.all([
        api.get<IntegrationStatus>("/api/v1/integrations/status"),
        api.get<{ accounts: LinkedAccount[]; error: string | null }>(
          "/api/v1/integrations/linked-accounts"),
        api.get<{ settings: NotificationSetting[] }>(
          "/api/v1/integrations/notification-settings"),
      ]);
      setStatus(st);
      setAccounts(acc.accounts);
      setAccountsError(acc.error);
      const map: Record<string, boolean> = {};
      for (const s of ns.settings) map[s.event_key] = s.enabled;
      setSettings(map);
    } catch {
      setAccountsError("Could not load integration data — is the API running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (eventKey: string) => {
    const next = !settings[eventKey];
    setToggleError(null);
    try {
      await api.put(`/api/v1/integrations/notification-settings/${encodeURIComponent(eventKey)}`,
        { enabled: next });
      setSettings((p) => ({ ...p, [eventKey]: next }));
    } catch {
      setToggleError("Could not update the setting (admin role required).");
    }
  };

  return (
    <div className="workspace-page flex flex-col gap-6 p-5 md:p-8">
      <WorkspaceHeader
        eyebrow="Operations"
        title="Integrations"
        description="External tools connected through ACI.dev — notify-out and governed external actions."
        actions={
          status && (
            <a
              href={status.portal_url}
              target="_blank"
              rel="noreferrer"
              className="workspace-primary-action"
              data-testid="connect-app-link"
            >
              Connect a new app ↗
            </a>
          )
        }
      />

      {!loading && status && !status.configured && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          The ACI integration isn&apos;t configured (ACI_API_KEY is unset). External actions and
          notify-out are disabled; everything else in DataOne works normally.
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface-elevated">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-fg-muted">Linked accounts</h3>
          <p className="text-xs text-fg0">
            OAuth connections are managed in ACI&apos;s own dev portal — DataOne only reads them.
          </p>
        </div>
        {loading ? (
          <div className="p-4">
            <LoadingState label="Loading linked accounts" />
          </div>
        ) : accountsError ? (
          <div className="p-4 text-sm text-fg-subtle">{accountsError}</div>
        ) : accounts.length === 0 ? (
          <div className="p-4 text-sm text-fg0">
            No linked accounts yet — use “Connect a new app” to link one in the ACI portal.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg0 border-b border-border">
                <th className="px-4 py-2">App</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="px-4 py-2 font-mono text-fg-muted">{a.app_name ?? "—"}</td>
                  <td className="px-4 py-2 text-fg-subtle">{a.linked_account_owner_id ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant={a.enabled ? "success" : "neutral"} size="sm" dot>
                      {a.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-elevated">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-fg-muted">Governed external actions</h3>
          <p className="text-xs text-fg0">
            From the same allow-list Autopilot uses — external side effects default to approval-only.
          </p>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {(status?.external_actions ?? []).map((a) => (
            <div key={a.action_type} className="flex items-center gap-3 text-sm">
              <span className="font-mono text-fg-muted">{a.action_type}</span>
              <SeverityChip level={a.risk as SeverityLevel} label={`${a.risk} risk`} />
              <Badge variant={a.auto_capable ? "info" : "neutral"} size="sm">
                {a.auto_capable ? "auto-capable (fixed destination)" : "approval required"}
              </Badge>
              <span className="text-xs text-fg0 truncate">{a.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-elevated">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-fg-muted">Notify-out</h3>
          <p className="text-xs text-fg0">
            Per-event opt-in (off by default) — messages link back to DataOne&apos;s own approval UI.
          </p>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {toggleError && <div className="text-xs text-danger">{toggleError}</div>}
          {KNOWN_EVENT_KEYS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={settings[key] ?? false}
                onChange={() => toggle(key)}
                className="accent-accent"
              />
              <span className="text-fg-muted">{label}</span>
              <span className="font-mono text-[10px] text-fg-subtle">{key}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
