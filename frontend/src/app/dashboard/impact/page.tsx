"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorState, Gauge, LoadingState, WorkspaceHeader } from "../components";
import { useWidgetData } from "../hooks/useWidgetData";

interface ConnectorRef {
  id: number;
  name: string;
}

interface CatalogColumn {
  column_name: string;
}

interface CatalogTable {
  table_name: string;
  columns: CatalogColumn[];
}

interface CatalogTableListResponse {
  tables: CatalogTable[];
}

interface ImpactEdge {
  mapping_id: number;
  mapping_name: string;
  target_table?: string;
  target_column?: string;
  source_table?: string;
  source_column?: string;
}

interface ImpactPipeline {
  pipeline_id: number;
  pipeline_name: string;
}

interface ImpactMetric {
  metric_id: number;
  metric_name: string;
  column: string;
}

interface ImpactResult {
  connection_id: number;
  connection_name: string;
  table: string;
  column: string | null;
  upstream: ImpactEdge[];
  downstream: ImpactEdge[];
  affected_pipelines: ImpactPipeline[];
  affected_metrics: ImpactMetric[];
  affected_reports: unknown[];
  affected_ml_models: unknown[];
  is_pii: boolean;
  risk_score: number;
  risk_score_explanation: string;
}

export default function ImpactAnalysisPage() {
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [table, setTable] = useState<string>("");
  const [column, setColumn] = useState<string>("");

  const { data: connections } = useWidgetData<ConnectorRef[]>(
    (signal) => api.get<ConnectorRef[]>("/api/v1/connectors/", { signal }),
    [],
  );

  const { data: catalog } = useWidgetData<CatalogTableListResponse | null>(
    (signal) => {
      if (connectionId == null) return Promise.resolve(null);
      return api.get<CatalogTableListResponse>(`/api/v1/catalog/${connectionId}/tables`, { signal });
    },
    [connectionId],
  );

  const { data: impact, isLoading, isError, errorMessage } = useWidgetData<ImpactResult | null>(
    (signal) => {
      if (connectionId == null || !table) return Promise.resolve(null);
      const params = new URLSearchParams({ connection_id: String(connectionId), table });
      if (column) params.set("column", column);
      return api.get<ImpactResult>(`/api/v1/impact?${params}`, { signal });
    },
    [connectionId, table, column],
  );

  const tables = catalog?.tables ?? [];
  const columns = tables.find((t) => t.table_name === table)?.columns ?? [];
  const totalConsumers =
    (impact?.downstream.length ?? 0) + (impact?.affected_pipelines.length ?? 0) + (impact?.affected_metrics.length ?? 0);

  return (
    <div className="workspace-page flex h-full flex-col">
      <WorkspaceHeader
        eyebrow="Topology & Lineage"
        title="Impact Analysis"
        description="Trace declared upstream and downstream dependencies, affected pipelines and metrics, and the resulting risk score."
        className="shrink-0 border-b border-border bg-glass-bg-strong px-4 py-4 backdrop-blur-xl md:px-6"
      />

      <div className="m-3 flex flex-wrap items-center gap-2 rounded-xl border border-glass-border bg-glass-bg p-3 shadow-[var(--glass-shadow)] backdrop-blur-xl">
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
          Connection
          <select
            value={connectionId ?? ""}
            onChange={(e) => { setConnectionId(e.target.value === "" ? null : Number(e.target.value)); setTable(""); setColumn(""); }}
            className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none"
          >
            <option value="">Select…</option>
            {(connections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
          Table
          <select
            value={table}
            onChange={(e) => { setTable(e.target.value); setColumn(""); }}
            disabled={connectionId == null}
            className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none disabled:opacity-50"
          >
            <option value="">Select…</option>
            {tables.map((t) => <option key={t.table_name} value={t.table_name}>{t.table_name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
          Column (optional)
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            disabled={!table}
            className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none disabled:opacity-50"
          >
            <option value="">All columns</option>
            {columns.map((c) => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {connectionId == null || !table ? (
          <EmptyState title="Select a table" description="Pick a connection and table above to see its declared dependencies." />
        ) : isLoading ? (
          <LoadingState label="Tracing dependencies…" />
        ) : isError ? (
          <ErrorState message={errorMessage} />
        ) : !impact ? null : (
          <div className="flex flex-col gap-4">
            <Card variant="glass" padding="sm" className="flex items-center gap-6">
              <Gauge value={impact.risk_score} size="md" />
              <div>
                <div className="text-sm font-semibold text-fg">
                  {impact.connection_name}.{impact.table}{impact.column ? `.${impact.column}` : ""}
                </div>
                <div className="text-xs text-fg-subtle">{impact.risk_score_explanation}</div>
                {impact.is_pii && <Badge variant="danger" size="sm" className="mt-1">PII</Badge>}
              </div>
              <div className="ml-auto text-right">
                <div className="text-2xl font-bold text-fg">{totalConsumers}</div>
                <div className="text-[10px] text-fg-subtle">declared consumers</div>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card as="section" variant="glass" padding="sm">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Upstream ({impact.upstream.length})
                </h4>
                {impact.upstream.length === 0 ? (
                  <p className="text-xs text-fg-subtle">No declared upstream mapping.</p>
                ) : impact.upstream.map((edge, i) => (
                  <div key={i} className="mb-1.5 rounded-lg border border-border/60 p-2 text-xs">
                    <span className="font-mono text-fg-muted">{edge.source_table}.{edge.source_column}</span>
                    <span className="mx-1 text-fg-subtle">via</span>
                    <span className="text-fg-subtle">{edge.mapping_name}</span>
                  </div>
                ))}
              </Card>

              <Card as="section" variant="glass" padding="sm">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Downstream ({impact.downstream.length})
                </h4>
                {impact.downstream.length === 0 ? (
                  <p className="text-xs text-fg-subtle">No declared downstream mapping.</p>
                ) : impact.downstream.map((edge, i) => (
                  <div key={i} className="mb-1.5 rounded-lg border border-border/60 p-2 text-xs">
                    <span className="font-mono text-fg-muted">{edge.target_table}.{edge.target_column}</span>
                    <span className="mx-1 text-fg-subtle">via</span>
                    <span className="text-fg-subtle">{edge.mapping_name}</span>
                  </div>
                ))}
              </Card>

              <Card as="section" variant="glass" padding="sm">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Affected Pipelines ({impact.affected_pipelines.length})
                </h4>
                {impact.affected_pipelines.length === 0 ? (
                  <p className="text-xs text-fg-subtle">None.</p>
                ) : impact.affected_pipelines.map((p) => (
                  <div key={p.pipeline_id} className="mb-1.5 rounded-lg border border-border/60 p-2 text-xs text-fg-muted">{p.pipeline_name}</div>
                ))}
              </Card>

              <Card as="section" variant="glass" padding="sm">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Affected Metrics ({impact.affected_metrics.length})
                </h4>
                {impact.affected_metrics.length === 0 ? (
                  <p className="text-xs text-fg-subtle">None.</p>
                ) : impact.affected_metrics.map((m) => (
                  <div key={m.metric_id} className="mb-1.5 rounded-lg border border-border/60 p-2 text-xs text-fg-muted">{m.metric_name}</div>
                ))}
              </Card>
            </div>

            <p className="text-[10px] text-fg-subtle">
              Affected reports and ML models are not yet tracked by any registry in this platform — shown as empty, not fabricated.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
