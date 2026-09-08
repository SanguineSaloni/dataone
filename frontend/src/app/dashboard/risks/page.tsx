"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorState, LoadingState, SeverityChip, WorkspaceHeader } from "../components";
import type { SeverityLevel } from "../components";
import { useWidgetData } from "../hooks/useWidgetData";

interface RiskFinding {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  root_cause: string;
  impact: string;
  remediation: string;
  effort: "S" | "M" | "L";
  connection_id: number | null;
  connection_name: string | null;
  mapping_id: number | null;
  table: string | null;
  column: string | null;
  detected_at: string | null;
  evidence: Record<string, unknown>;
}

interface RiskRegister {
  total: number;
  findings: RiskFinding[];
  facets: { by_category: Record<string, number>; by_severity: Record<string, number> };
  partial: boolean;
  partial_reason: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  missing_target_table: "Missing Target Table",
  schema_drift: "Schema Drift",
  pii_exposure: "PII Exposure",
  unsupported_transformation: "Unsupported Transformation",
  broken_dependency: "Broken Dependency",
};

const SEVERITY_ORDER: RiskFinding["severity"][] = ["critical", "high", "medium", "low"];

function toSeverityLevel(s: RiskFinding["severity"]): SeverityLevel {
  return s === "critical" ? "critical" : s === "high" ? "high" : s === "medium" ? "medium" : "low";
}

export default function RiskComplianceCenterPage() {
  const [category, setCategory] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [selected, setSelected] = useState<RiskFinding | null>(null);

  const { data: register, isLoading: loading, isError, errorMessage } = useWidgetData<RiskRegister>(
    (signal) => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (severity) params.set("severity", severity);
      return api.get<RiskRegister>(`/api/v1/risks${params.toString() ? `?${params}` : ""}`, { signal });
    },
    [category, severity],
  );
  const error = isError ? (errorMessage ?? "Failed to load the risk register.") : null;

  return (
    <div className="workspace-page flex h-full flex-col">
      <WorkspaceHeader
        eyebrow="Governance & Compliance"
        title="Risk & Compliance"
        description="Investigate missing mappings, schema drift, PII exposure, unsupported transformations, and broken dependencies."
        className="shrink-0 border-b border-border bg-glass-bg-strong px-4 py-4 backdrop-blur-xl md:px-6"
      />
      <div className="px-4">
        {register && register.partial && (
          <div role="status" className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-warning">
            Some signal sources could not be evaluated ({register.partial_reason}) — this register may be incomplete.
          </div>
        )}
      </div>

      <div className="m-3 flex flex-wrap items-center gap-2 rounded-xl border border-glass-border bg-glass-bg p-3 shadow-[var(--glass-shadow)] backdrop-blur-xl">
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
          Category
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setSelected(null); }}
            className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none"
          >
            <option value="">All</option>
            {Object.keys(CATEGORY_LABELS).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
          Severity
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setSelected(null); }}
            className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none"
          >
            <option value="">All</option>
            {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {register && (
          <div className="ml-auto flex items-center gap-1.5">
            {SEVERITY_ORDER.filter((s) => register.facets.by_severity[s]).map((s) => (
              <Badge key={s} variant={s === "critical" || s === "high" ? "danger" : s === "medium" ? "warning" : "neutral"} size="sm">
                {register.facets.by_severity[s]} {s}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden xl:flex-row">
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <LoadingState label="Aggregating risk signals…" />
          ) : error ? (
            <ErrorState message={error} />
          ) : !register || register.findings.length === 0 ? (
            <EmptyState title="No risks detected" description="Every checked signal source is clean for the current filters." />
          ) : (
            <div className="flex flex-col gap-2">
              {register.findings.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => setSelected(finding)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-surface-overlay ${
                    selected?.id === finding.id ? "border-accent bg-accent-soft" : "border-border bg-glass-bg"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-fg truncate">{finding.title}</span>
                    <SeverityChip level={toSeverityLevel(finding.severity)} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-subtle">
                    <span>{CATEGORY_LABELS[finding.category] ?? finding.category}</span>
                    {finding.connection_name && <><span>·</span><span>{finding.connection_name}</span></>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="max-h-80 w-full overflow-y-auto border-t border-border bg-glass-bg xl:max-h-none xl:w-96 xl:border-l xl:border-t-0">
          {selected ? (
            <Card padding="md" className="m-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-fg">{selected.title}</h4>
                <SeverityChip level={toSeverityLevel(selected.severity)} />
              </div>
              <dl className="mt-3 flex flex-col gap-3 text-xs">
                <div><dt className="font-semibold text-fg-subtle">Description</dt><dd className="mt-0.5 text-fg-muted">{selected.description}</dd></div>
                <div><dt className="font-semibold text-fg-subtle">Root cause</dt><dd className="mt-0.5 text-fg-muted">{selected.root_cause}</dd></div>
                <div><dt className="font-semibold text-fg-subtle">Impact</dt><dd className="mt-0.5 text-fg-muted">{selected.impact}</dd></div>
                <div><dt className="font-semibold text-fg-subtle">Recommended remediation</dt><dd className="mt-0.5 text-fg-muted">{selected.remediation}</dd></div>
                <div className="flex items-center justify-between">
                  <dt className="font-semibold text-fg-subtle">Estimated effort</dt>
                  <dd><Badge variant="neutral" size="sm">{selected.effort}</Badge></dd>
                </div>
              </dl>
            </Card>
          ) : (
            <div className="p-6 text-center text-xs text-fg-subtle">Select a finding to see root cause, impact, and remediation.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
