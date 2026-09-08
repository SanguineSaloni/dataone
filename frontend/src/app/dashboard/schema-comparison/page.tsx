"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Badge, EmptyState, ErrorState, LoadingState, WorkspaceHeader } from "../components";
import { useWidgetData } from "../hooks/useWidgetData";

interface ConnectorRef {
  id: number;
  name: string;
}

interface TypeChange {
  column: string;
  source_type: string;
  target_type: string;
}

interface ConstraintChange {
  column: string;
  source_nullable: boolean | null;
  target_nullable: boolean | null;
  source_primary_key: boolean;
  target_primary_key: boolean;
}

interface TableComparison {
  table: string;
  status: "matched" | "source_only" | "target_only";
  added_columns: string[];
  missing_columns: string[];
  changed_types: TypeChange[];
  changed_constraints: ConstraintChange[];
  column_count: number;
}

interface ComparisonResult {
  source_id: number;
  source_name: string;
  target_id: number;
  target_name: string;
  tables: TableComparison[];
  summary: {
    table_count: number;
    matched_tables: number;
    source_only_tables: number;
    target_only_tables: number;
    tables_with_changes: number;
  };
}

function hasAnyChange(t: TableComparison): boolean {
  return (
    t.status !== "matched" ||
    t.added_columns.length > 0 ||
    t.missing_columns.length > 0 ||
    t.changed_types.length > 0 ||
    t.changed_constraints.length > 0
  );
}

export default function SchemaComparisonPage() {
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [changesOnly, setChangesOnly] = useState(false);
  const [search, setSearch] = useState("");

  const { data: connections } = useWidgetData<ConnectorRef[]>(
    (signal) => api.get<ConnectorRef[]>("/api/v1/connectors/", { signal }),
    [],
  );

  const { data: comparison, isLoading, isError, errorMessage } = useWidgetData<ComparisonResult | null>(
    (signal) => {
      if (sourceId == null || targetId == null) return Promise.resolve(null);
      return api.get<ComparisonResult>(
        `/api/v1/schema-comparison?source_id=${sourceId}&target_id=${targetId}`, { signal },
      );
    },
    [sourceId, targetId],
  );

  const visibleTables = useMemo(() => {
    let tables = comparison?.tables ?? [];
    if (changesOnly) tables = tables.filter(hasAnyChange);
    if (search.trim()) {
      const q = search.toLowerCase();
      tables = tables.filter((t) =>
        t.table.toLowerCase().includes(q) ||
        t.added_columns.some((c) => c.toLowerCase().includes(q)) ||
        t.missing_columns.some((c) => c.toLowerCase().includes(q)));
    }
    return tables;
  }, [comparison, changesOnly, search]);

  return (
    <div className="workspace-page flex h-full flex-col">
      <WorkspaceHeader
        eyebrow="Schema Intelligence"
        title="Schema Comparison"
        description="Compare source and target structures across columns, types, and constraints."
        className="shrink-0 border-b border-border bg-glass-bg-strong px-4 py-4 backdrop-blur-xl md:px-6"
      />

      <div className="m-3 flex flex-wrap items-center gap-2 rounded-xl border border-glass-border bg-glass-bg p-3 shadow-[var(--glass-shadow)] backdrop-blur-xl">
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
          Source
          <select value={sourceId ?? ""} onChange={(e) => setSourceId(e.target.value === "" ? null : Number(e.target.value))} className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none">
            <option value="">Select…</option>
            {(connections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
          Target
          <select value={targetId ?? ""} onChange={(e) => setTargetId(e.target.value === "" ? null : Number(e.target.value))} className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none">
            <option value="">Select…</option>
            {(connections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} />
          Changes only
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search table or column…"
          aria-label="Search compared tables or columns"
          className="rounded-lg border border-border-strong bg-surface-overlay px-2 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
        />
        {comparison && (
          <div className="ml-auto flex items-center gap-1.5">
            <Badge variant="success" size="sm">{comparison.summary.matched_tables} matched</Badge>
            <Badge variant="danger" size="sm">{comparison.summary.source_only_tables} source-only</Badge>
            <Badge variant="warning" size="sm">{comparison.summary.target_only_tables} target-only</Badge>
            <Badge variant="info" size="sm">{comparison.summary.tables_with_changes} with changes</Badge>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {sourceId == null || targetId == null ? (
          <EmptyState title="Pick a source and target" description="Select two connections above to compare their schemas." />
        ) : isLoading ? (
          <LoadingState label="Comparing schemas…" />
        ) : isError ? (
          <ErrorState message={errorMessage} />
        ) : visibleTables.length === 0 ? (
          <EmptyState title="No tables match" description="Try clearing the search or the changes-only filter." />
        ) : (
          <div className="flex flex-col gap-3">
            {visibleTables.map((table) => (
              <div key={table.table} className="rounded-xl border border-border bg-surface-elevated p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-fg">{table.table}</span>
                  {table.status === "source_only" && <Badge variant="danger" size="sm">✖ Source only</Badge>}
                  {table.status === "target_only" && <Badge variant="warning" size="sm">✖ Target only</Badge>}
                  {table.status === "matched" && !hasAnyChange(table) && <Badge variant="success" size="sm">✔ Identical</Badge>}
                  {table.status === "matched" && hasAnyChange(table) && <Badge variant="info" size="sm">⚠ Changed</Badge>}
                </div>
                {table.status === "matched" && hasAnyChange(table) && (
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    {table.added_columns.map((c) => (
                      <div key={`add-${c}`} className="text-emerald-500">✔ Added: <span className="font-mono">{c}</span></div>
                    ))}
                    {table.missing_columns.map((c) => (
                      <div key={`miss-${c}`} className="text-red-500">✖ Missing: <span className="font-mono">{c}</span></div>
                    ))}
                    {table.changed_types.map((c) => (
                      <div key={`type-${c.column}`} className="text-amber-500">
                        ⚠ Type changed: <span className="font-mono">{c.column}</span> ({c.source_type} → {c.target_type})
                      </div>
                    ))}
                    {table.changed_constraints.map((c) => (
                      <div key={`constraint-${c.column}`} className="text-violet-400">
                        ⚡ Constraint changed: <span className="font-mono">{c.column}</span>
                        {c.source_primary_key !== c.target_primary_key && ` (primary key: ${c.source_primary_key} → ${c.target_primary_key})`}
                        {c.source_nullable !== c.target_nullable && ` (nullable: ${c.source_nullable} → ${c.target_nullable})`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
