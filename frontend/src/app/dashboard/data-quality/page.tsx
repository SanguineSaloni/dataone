"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorState, Gauge, LoadingState, WorkspaceHeader } from "../components";
import { useWidgetData } from "../hooks/useWidgetData";

interface ConnectorRef {
  id: number;
  name: string;
}

interface ColumnScorecard {
  column: string;
  completeness: number | null;
  uniqueness: number | null;
  consistency: number | null;
  accuracy: number | null;
  freshness: number | null;
  overall: number | null;
  profiled: boolean;
}

interface TableScorecard {
  table: string;
  column_count: number;
  profiled_column_count: number;
  overall: number | null;
  columns: ColumnScorecard[];
  last_scanned_at: string | null;
}

interface ConnectionScorecard {
  connection_id: number;
  connection_name: string;
  overall: number | null;
  table_count: number;
  column_count: number;
  profiled_column_count: number;
  tables: TableScorecard[];
}

function scoreColor(score: number | null): "success" | "warning" | "danger" | "neutral" {
  if (score === null) return "neutral";
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function ScoreCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-fg-subtle">{label}</span>
      {value === null ? (
        <span className="text-xs text-fg-subtle" title="Not yet available">—</span>
      ) : (
        <Badge variant={scoreColor(value)} size="sm">{value}%</Badge>
      )}
    </div>
  );
}

export default function DataQualityObservatoryPage() {
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  const { data: connections } = useWidgetData<ConnectorRef[]>(
    (signal) => api.get<ConnectorRef[]>("/api/v1/connectors/", { signal }),
    [],
  );

  const { data: card, isLoading, isError, errorMessage } = useWidgetData<ConnectionScorecard | null>(
    (signal) => {
      if (connectionId == null) return Promise.resolve(null);
      return api.get<ConnectionScorecard>(`/api/v1/dq/scorecard/${connectionId}`, { signal });
    },
    [connectionId],
  );

  return (
    <div className="workspace-page flex h-full flex-col">
      <WorkspaceHeader
        eyebrow="Schema Intelligence"
        title="Data Quality Observatory"
        description="Review completeness, uniqueness, and consistency calculated from profiling data. Unmeasured dimensions remain explicitly unavailable."
        className="shrink-0 border-b border-border bg-glass-bg-strong px-4 py-4 backdrop-blur-xl md:px-6"
        actions={<label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
          Connection
          <select
            value={connectionId ?? ""}
            onChange={(e) => setConnectionId(e.target.value === "" ? null : Number(e.target.value))}
            className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none"
          >
            <option value="">Select…</option>
            {(connections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {connectionId == null ? (
          <EmptyState title="Pick a connection" description="Select a connection above to see its data quality scorecard." />
        ) : isLoading ? (
          <LoadingState label="Computing scorecard…" />
        ) : isError ? (
          <ErrorState message={errorMessage} />
        ) : !card || card.table_count === 0 ? (
          <EmptyState title="No cataloged tables" description="Scan this connection from Schema Intel first." />
        ) : (
          <div className="flex flex-col gap-4">
            <Card variant="glass" padding="sm" className="flex items-center gap-6">
              <Gauge value={card.overall ?? 0} size="md" />
              <div>
                <div className="text-sm font-semibold text-fg">{card.connection_name}</div>
                <div className="text-xs text-fg-subtle">
                  {card.overall === null
                    ? "No profiled columns yet"
                    : `Overall score ${card.overall}% · ${card.profiled_column_count}/${card.column_count} columns profiled`}
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-2">
              {card.tables.map((table) => (
                <Card key={table.table} variant="glass" padding="sm" className="overflow-hidden !p-0">
                  <button
                    type="button"
                    onClick={() => setExpandedTable((cur) => (cur === table.table ? null : table.table))}
                    aria-expanded={expandedTable === table.table}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-surface-overlay"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{table.table}</span>
                      <span className="text-[10px] text-fg-subtle">
                        {table.profiled_column_count}/{table.column_count} profiled
                      </span>
                    </div>
                    <Badge variant={scoreColor(table.overall)} size="sm">
                      {table.overall === null ? "—" : `${table.overall}%`}
                    </Badge>
                  </button>
                  {expandedTable === table.table && (
                    <div className="overflow-x-auto border-t border-border p-3">
                      <table className="w-full min-w-[44rem] text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wide text-fg-subtle">
                            <th className="py-1">Column</th>
                            <th>Completeness</th>
                            <th>Uniqueness</th>
                            <th>Consistency</th>
                            <th>Accuracy</th>
                            <th>Freshness</th>
                            <th>Overall</th>
                          </tr>
                        </thead>
                        <tbody>
                          {table.columns.map((col) => (
                            <tr key={col.column} className="border-t border-border/60">
                              <td className="py-1.5 font-mono text-fg-muted">{col.column}</td>
                              <td><ScoreCell label="" value={col.completeness} /></td>
                              <td><ScoreCell label="" value={col.uniqueness} /></td>
                              <td><ScoreCell label="" value={col.consistency} /></td>
                              <td><ScoreCell label="" value={col.accuracy} /></td>
                              <td><ScoreCell label="" value={col.freshness} /></td>
                              <td><ScoreCell label="" value={col.overall} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
