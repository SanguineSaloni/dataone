"use client";
/**
 * Semantic / Metrics Layer — frontend editor (DP-SEM-001, SEM-T6, Task #7).
 *
 * Wires the /api/v1/semantic/* surface into a no-SQL editor that uses
 * the definition language (Task #3) to render form fields per
 * measure/dimension type. Save-draft + publish flow.
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { classNames } from "../schema-mapper/lib/format";
import type { MetricCatalogEntry, MetricDefinitionDraft, MetricDefinitionView } from "./lib/types";
import { Card, ErrorState, LoadingState, WorkspaceHeader } from "../components";


type Role = "admin" | "analyst" | "viewer";


export default function SemanticPage() {
  const [catalog, setCatalog] = useState<MetricCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [search, setSearch] = useState("");
  const [onlyPublished, setOnlyPublished] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (onlyPublished) params.set("only_published", "true");
      const data = await api.get<MetricCatalogEntry[]>(
        `/api/v1/semantic/metrics?${params.toString()}`,
      );
      setCatalog(data);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Backend unreachable.";
      setError(message);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [search, onlyPublished]);

  useEffect(() => {
    void (async () => {
      try {
        const me = await api.get<{ role: Role }>("/api/v1/auth/me");
        setRole(me.role);
      } catch {
        setRole(null);
      }
    })();
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const canEdit = role === "admin" || role === "analyst";
  const canPublish = role === "admin";

  return (
    <div className="workspace-page flex h-full flex-col">
      <WorkspaceHeader
        eyebrow="Schema Intelligence"
        title="Semantic / Metrics"
        description="Define governed business metrics, publish immutable versions, and expose their declared lineage without writing SQL."
        className="shrink-0 border-b border-border bg-glass-bg-strong px-4 py-4 backdrop-blur-xl md:px-6"
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <CatalogList
        catalog={catalog}
        loading={loading}
        error={error}
        search={search}
        onlyPublished={onlyPublished}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onSearchChange={setSearch}
        onOnlyPublishedChange={setOnlyPublished}
        canCreate={canEdit}
        onCreated={(m) => {
          void fetchCatalog();
          setSelectedId(m.id);
        }}
        />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {!selectedId ? (
          <MetricEmptyState canCreate={canEdit} />
        ) : (
          <MetricDetail
            metricId={selectedId}
            onChanged={() => {
              void fetchCatalog();
            }}
            canEdit={canEdit}
            canPublish={canPublish}
          />
        )}
      </div>
      </div>
    </div>
  );
}


function CatalogList({
  catalog, loading, error, search, onlyPublished, selectedId,
  onSelect, onSearchChange, onOnlyPublishedChange, canCreate, onCreated,
}: {
  catalog: MetricCatalogEntry[];
  loading: boolean;
  error: string | null;
  search: string;
  onlyPublished: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onSearchChange: (v: string) => void;
  onOnlyPublishedChange: (v: boolean) => void;
  canCreate: boolean;
  onCreated: (m: MetricCatalogEntry) => void;
}) {
  return (
    <aside
      className="flex max-h-72 w-full flex-col border-b border-border bg-glass-bg md:max-h-none md:w-72 md:border-b-0 md:border-r"
      aria-label="Metric catalog"
    >
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-fg-muted">Metric Catalog</h3>
        <p className="text-[10px] uppercase tracking-wider text-fg-subtle">
          Drafts & published
        </p>
      </div>
      <div className="p-3 border-b border-border space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name or description"
          aria-label="Search metrics"
          className="w-full rounded border border-border-strong bg-surface-overlay px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-fg-subtle">
          <input
            type="checkbox"
            checked={onlyPublished}
            onChange={(e) => onOnlyPublishedChange(e.target.checked)}
          />
          Hide drafts
        </label>
      </div>
      {canCreate && (
        <div className="p-3 border-b border-border">
          <NewMetricButton onCreated={onCreated} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs text-fg-subtle">Loading catalog…</div>
        ) : error ? (
          <div className="p-4 text-xs text-danger" role="alert">{error}</div>
        ) : catalog.length === 0 ? (
          <div className="p-4 text-xs italic text-fg-subtle">
            No metrics yet.
          </div>
        ) : (
          <ul className="p-2 flex flex-col gap-1">
            {catalog.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onSelect(m.id)}
                  aria-current={selectedId === m.id ? "true" : undefined}
                  className={classNames(
                    "w-full text-left px-3 py-2 rounded-lg text-xs border transition-all",
                    selectedId === m.id
                      ? "bg-accent-soft border-accent/30 text-accent"
                      : "border-transparent hover:bg-surface-overlay text-fg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium truncate">{m.name}</span>
                    <span
                      className={classNames(
                        "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        m.status === "published"
                          ? "bg-success/10 text-success border border-success/20"
                          : "bg-warning/10 text-warning border border-warning/20",
                        m.certified && "ring-1 ring-edge-business-rule/40",
                      )}
                    >
                      {m.status}
                    </span>
                  </div>
                  {m.certified && (
                    <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-edge-business-rule">
                      ✓ Certified
                    </div>
                  )}
                  {m.description && (
                    <div className="mt-1 truncate text-[10px] text-fg-subtle">
                      {m.description}
                    </div>
                  )}
                  <div className="mt-1 text-[9px] text-fg-subtle">
                    v{m.version_number} · {m.aggregation ?? "—"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}


function NewMetricButton({ onCreated }: { onCreated: (m: MetricCatalogEntry) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const m = await api.post<MetricCatalogEntry>("/api/v1/semantic/metrics/", {
        name: name.trim(),
        definition: { entity: "", measure: "", aggregation: "sum" },
      });
      onCreated(m);
      setShowForm(false);
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create metric.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="workspace-primary-action min-h-0 w-full rounded-lg px-3 py-1.5 text-xs"
      >
        + New metric
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Metric name"
        aria-label="Metric name"
        autoFocus
        className="w-full px-3 py-1.5 rounded bg-surface-overlay border border-border-strong text-xs text-fg focus:outline-none focus:border-accent"
      />
      {error && <div className="text-[10px] text-danger">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex-1 px-2 py-1 text-xs font-semibold rounded bg-accent text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create draft"}
        </button>
        <button
          type="button"
          onClick={() => { setShowForm(false); setError(null); }}
          className="px-2 py-1 text-xs text-fg-subtle hover:text-fg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}


function MetricEmptyState({ canCreate }: {
  canCreate: boolean;
}) {
  return (
    <div className="max-w-md text-center mx-auto py-20">
      <div className="text-5xl mb-3">📐</div>
      <h2 className="text-lg font-semibold text-fg-muted mb-2">
        Select or create a metric
      </h2>
      <p className="text-sm text-fg-subtle">
        Pick a metric from the catalog on the left, or create a new one
        {canCreate ? " to start defining it." : "."}
      </p>
    </div>
  );
}


function MetricDetail({
  metricId, onChanged, canEdit, canPublish,
}: {
  metricId: number;
  onChanged: () => void;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const [metric, setMetric] = useState<MetricDefinitionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MetricDefinitionDraft | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await api.get<MetricDefinitionView>(
        `/api/v1/semantic/metrics/${metricId}`,
      );
      setMetric(m);
      setDraft({
        entity: m.definition?.entity ?? "",
        measure: m.definition?.measure ?? "",
        aggregation: m.definition?.aggregation ?? "sum",
        time_grain: m.definition?.time_grain ?? "",
        time_column: m.definition?.time_column ?? "",
        description: m.description ?? "",
        certified: m.certified,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load metric.");
      setMetric(null);
    } finally {
      setLoading(false);
    }
  }, [metricId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const isDraft = metric?.status === "draft";
  const canEditThisVersion = canEdit && isDraft;
  const canPublishThis = canPublish && isDraft;

  const saveDraft = async () => {
    if (!metric || !draft) return;
    try {
      await api.put(`/api/v1/semantic/metrics/${metric.id}`, {
        definition: {
          entity: draft.entity,
          measure: draft.measure,
          aggregation: draft.aggregation,
          time_grain: draft.time_grain || undefined,
          time_column: draft.time_column || undefined,
        },
        description: draft.description || undefined,
        certified: draft.certified,
      });
      setEditing(false);
      void fetch();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed.");
    }
  };

  const publish = async () => {
    if (!metric) return;
    if (!confirm(
      `Publish v${metric.version_number} of "${metric.name}"? Published versions are immutable.`,
    )) return;
    try {
      await api.post(`/api/v1/semantic/metrics/${metric.id}/publish`, {});
      void fetch();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publish failed.");
    }
  };

  if (loading) return <LoadingState label="Loading metric…" />;
  if (error) return <ErrorState title="Metric could not be loaded" message={error} onRetry={() => void fetch()} />;
  if (!metric || !draft) return <ErrorState title="Metric not found" />;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-fg">{metric.name}</h2>
          <p className="text-xs text-fg-subtle mt-1">
            v{metric.version_number} · {metric.status} ·
            {" "}created by {metric.created_by}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {metric.certified && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-edge-business-rule/15 text-edge-business-rule border border-edge-business-rule/30">
              ✓ Certified
            </span>
          )}
          <span
            className={classNames(
              "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
              isDraft
                ? "bg-warning/10 text-warning border border-warning/20"
                : "bg-success/10 text-success border border-success/20",
            )}
          >
            {metric.status}
          </span>
        </div>
      </div>

      {editing ? (
        <DefinitionEditor draft={draft} setDraft={setDraft} />
      ) : (
        <DefinitionView metric={metric} />
      )}

      <div className="flex gap-2">
        {canEditThisVersion && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-overlay text-fg-muted hover:bg-surface-overlay"
          >
            ✎ Edit
          </button>
        )}
        {canEditThisVersion && editing && (
          <>
            <button
              type="button"
              onClick={saveDraft}
              className="workspace-primary-action min-h-0 rounded-lg px-3 py-1.5 text-xs"
            >
              💾 Save draft
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs text-fg-subtle hover:text-fg-muted"
            >
              Cancel
            </button>
          </>
        )}
        {canPublishThis && (
          <button
            type="button"
            onClick={publish}
            className="workspace-primary-action min-h-0 rounded-lg px-3 py-1.5 text-xs"
          >
            🚀 Publish v{metric.version_number}
          </button>
        )}
        {!canEditThisVersion && (
          <p className="text-[11px] text-fg-subtle italic">
            {isDraft
              ? "Your role can't edit this draft."
              : "Published versions are immutable; create a new draft to iterate."}
          </p>
        )}
      </div>
    </div>
  );
}


function DefinitionView({ metric }: { metric: MetricDefinitionView }) {
  const def = metric.definition ?? {};
  return (
    <div className="space-y-3">
      <Section title="Definition">
        <KV k="Entity" v={def.entity ?? "—"} />
        <KV k="Measure" v={def.measure ?? "—"} />
        <KV k="Aggregation" v={def.aggregation ?? "—"} />
        {def.time_grain && (
          <>
            <KV k="Time grain" v={def.time_grain} />
            <KV k="Time column" v={def.time_column ?? "—"} />
          </>
        )}
      </Section>
      {metric.description && (
        <Section title="Description">
          <p className="text-xs text-fg-muted">{metric.description}</p>
        </Section>
      )}
      {metric.lineage && metric.lineage.length > 0 && (
        <Section title={`Lineage (${metric.lineage.length})`}>
          <ul className="space-y-1 text-[11px] font-mono">
            {metric.lineage.map((ln) => (
              <li key={ln.id} className="text-fg-subtle">
                <span className="text-edge-business-rule">[{ln.role}]</span>{" "}
                catalog column #{ln.catalog_column_id ?? "—"}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}


function DefinitionEditor({ draft, setDraft }: {
  draft: MetricDefinitionDraft;
  setDraft: (d: MetricDefinitionDraft) => void;
}) {
  const set = (k: keyof MetricDefinitionDraft, v: string | boolean) =>
    setDraft({ ...draft, [k]: v });

  return (
    <Card variant="glass" padding="sm" className="space-y-3">
      <h3 className="text-sm font-semibold text-fg-muted">Edit definition</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Entity">
          <input
            type="text"
            value={draft.entity}
            onChange={(e) => set("entity", e.target.value)}
            placeholder="e.g. orders"
            className={inputCls}
          />
        </Field>
        <Field label="Measure">
          <input
            type="text"
            value={draft.measure}
            onChange={(e) => set("measure", e.target.value)}
            placeholder="e.g. amount"
            className={inputCls}
          />
        </Field>
        <Field label="Aggregation">
          <select
            value={draft.aggregation}
            onChange={(e) => set("aggregation", e.target.value)}
            className={inputCls}
          >
            {["sum", "count", "count_distinct", "avg", "min", "max"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Description (optional)">
          <input
            type="text"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Time grain (optional)">
          <select
            value={draft.time_grain}
            onChange={(e) => set("time_grain", e.target.value)}
            className={inputCls}
          >
            <option value="">— none —</option>
            {["day", "week", "month", "quarter", "year"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Time column (optional)">
          <input
            type="text"
            value={draft.time_column}
            onChange={(e) => set("time_column", e.target.value)}
            placeholder="e.g. created_at"
            className={inputCls}
            disabled={!draft.time_grain}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-fg-subtle">
        <input
          type="checkbox"
          checked={draft.certified}
          onChange={(e) => set("certified", e.target.checked)}
        />
        Mark as certified (FR8: certified badges visible to consumers)
      </label>
    </Card>
  );
}


const inputCls =
  "w-full px-2 py-1.5 rounded bg-surface-overlay border border-border-strong text-xs text-fg focus:outline-none focus:border-accent";


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-fg-subtle">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="glass" padding="sm">
      <h4 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-1">{children}</div>
    </Card>
  );
}


function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="text-fg-subtle min-w-[6rem]">{k}</span>
      <span className="text-fg-muted font-mono">{v}</span>
    </div>
  );
}
