"use client";
/**
 * Visualize — charting workspace (frontend_tasks/01_visualize_charting.md).
 *
 * Replaces the pre-TRD Database Topology Visualizer at this route (moved
 * to /dashboard/visualize/topology, still linked from the sidebar).
 * Data source: a connection's Schema Intel catalog table, queried live via
 * POST /api/v1/viz/query (real GROUP BY aggregation against the source DB,
 * not sample/mock data).
 */
import Link from "next/link";
import { useRef } from "react";

import { useVisualize } from "./hooks/useVisualize";

import ChartTypeSelector from "./components/ChartTypeSelector";
import FieldConfigPanel from "./components/FieldConfigPanel";
import FilterBar from "./components/FilterBar";
import ChartCanvas from "./components/ChartCanvas";
import SaveViewDialog from "./components/SaveViewDialog";
import ExportMenu from "./components/ExportMenu";
import Toast from "./components/Toast";
import { WorkspaceHeader } from "../components";

export default function VisualizePage() {
  const v = useVisualize();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const canSave = v.role === "admin" || v.role === "analyst";

  const selectedTable = v.catalogTables.find((t) => t.table_name === v.tableName) ?? null;
  const columns = selectedTable?.columns ?? [];

  return (
    <div className="workspace-page flex h-full flex-col">
      <WorkspaceHeader
        eyebrow="Topology & Lineage"
        title="Data Visualization"
        description="Build charts from catalog data using dimensions, measures, filters, and reusable saved views."
        className="shrink-0 border-b border-border bg-glass-bg-strong px-4 py-4 backdrop-blur-xl md:px-6"
        actions={<>
          {v.dataSourceMode === "catalog" && (
            <label className="flex items-center gap-2 text-xs text-fg-subtle">
              Connection
            <select
              aria-label="Visualization connection"
              value={v.connectionId ?? ""}
              onChange={(e) => v.setConnectionId(Number(e.target.value))}
              className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            >
              {v.connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            </label>
          )}
          {v.dataSourceMode === "catalog" && (
            <SaveViewDialog
              savedViews={v.savedViews}
              onSave={v.saveView}
              onLoad={v.loadView}
              onDelete={v.deleteView}
              canSave={canSave}
            />
          )}
          <ExportMenu result={v.result} containerRef={chartContainerRef} chartType={v.chartType} />
          <Link
            href="/dashboard/visualize/topology"
            className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-xs font-semibold text-fg-subtle hover:border-accent/30 hover:text-accent"
          >
            Schema Topology →
          </Link>
        </>}
      />

      {v.dataSourceMode === "query" && v.queryHandoff && (
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border bg-info/10 px-4 py-2 text-xs text-fg-muted md:px-6">
          <span className="truncate">
            Showing result from Query Workspace — only the currently loaded page of rows is charted.{" "}
            <code className="text-[11px] text-fg-subtle">{v.queryHandoff.sql}</code>
          </span>
          <button
            type="button"
            onClick={v.resetToCatalogMode}
            className="shrink-0 rounded-lg border border-border-strong bg-surface-overlay px-2 py-1 text-[11px] font-semibold text-fg-subtle hover:border-accent/30 hover:text-accent"
          >
            Back to catalog mode
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex max-h-[42%] w-full flex-col gap-5 overflow-y-auto border-b border-border bg-glass-bg p-4 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
          <div>
            <div className="text-xs text-fg-subtle mb-1.5">Chart type</div>
            <ChartTypeSelector
              value={v.chartType}
              onChange={v.setChartType}
              dimensionCount={v.dimensions.length}
              measureCount={v.measures.length}
            />
          </div>

          <FieldConfigPanel
            catalogTables={v.catalogTables}
            catalogLoading={v.catalogLoading}
            tableName={v.tableName}
            onTableChange={v.setTableName}
            dimensions={v.dimensions}
            onDimensionsChange={v.setDimensions}
            measures={v.measures}
            onMeasuresChange={v.setMeasures}
          />

          <FilterBar columns={columns} filters={v.filters} onChange={v.setFilters} />
        </aside>

        <div className="flex-1 flex flex-col">
          <ChartCanvas
            chartType={v.chartType}
            result={v.result}
            dimensions={v.dimensions}
            measures={v.measures}
            loading={v.queryLoading}
            error={v.queryError}
            containerRef={chartContainerRef}
          />
        </div>
      </div>

      <Toast toast={v.toast} onDismiss={v.clearToast} />
    </div>
  );
}
