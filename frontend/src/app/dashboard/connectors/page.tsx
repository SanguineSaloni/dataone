"use client";
import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import type { Connector, TestResponse, SchemaData } from "./lib/types";
import { TYPE_META, VALID_TYPES } from "./lib/types";
import ConnectorCard from "./components/ConnectorCard";
import DynamicConnectorForm from "./components/DynamicConnectorForm";
import { EmptyState, ErrorState, LoadingState, WorkspaceHeader } from "../components";

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("sqlite");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { status: string; detail?: string }>>({});

  const [schemaModal, setSchemaModal] = useState<SchemaData | null>(null);
  const [scanningId, setScanningId] = useState<number | null>(null);

  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Connector[]>("/api/v1/connectors/");
      setConnectors(data);
    } catch (err) {
      setConnectors([]);
      setError(err instanceof ApiError ? err.message : "Failed to load connectors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    setCreating(true);
    try {
      await api.post("/api/v1/connectors/", { name, type, config });
      setIsModalOpen(false);
      setName("");
      setConfig({});
      await fetchConnectors();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create connector.");
    } finally {
      setCreating(false);
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResults(prev => ({ ...prev, [id]: { status: "testing" } }));
    try {
      const result = await api.post<TestResponse>(`/api/v1/connectors/${id}/test`, {});
      const detail = result.status === "connected"
        ? [result.diagnostics?.version, result.diagnostics?.latency_ms != null ? `${result.diagnostics.latency_ms} ms` : null].filter(Boolean).join(" · ")
        : result.error?.message;
      setTestResults(prev => ({ ...prev, [id]: { status: result.status, detail: detail ?? undefined } }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [id]: { status: "failed", detail: err instanceof ApiError ? err.message : undefined },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleScanSchema = async (id: number) => {
    setScanningId(id);
    try {
      const data = await api.get<SchemaData>(`/api/v1/connectors/${id}/schema`);
      setSchemaModal(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Schema scan failed.");
    } finally {
      setScanningId(null);
    }
  };

  return (
    <div className="workspace-page relative flex h-full flex-col gap-6 overflow-y-auto p-5 md:p-8">
      <WorkspaceHeader
        eyebrow="Operations"
        title="Connectors"
        description="Manage the databases Data One can inspect, map, query, and monitor. Test health or scan a schema without leaving this inventory."
        actions={
        <button
          type="button"
          onClick={() => { setIsModalOpen(true); setCreateError(null); }}
          className="workspace-primary-action"
        >
          <span aria-hidden="true">＋</span> New connector
        </button>
        }
      />

      {error && (
        <ErrorState title="Connectors could not be loaded" message={error} onRetry={() => void fetchConnectors()} />
      )}

      {error ? null : loading ? (
        <LoadingState label="Loading connectors" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connectors.map((c) => (
            <ConnectorCard
              key={c.id}
              connector={c}
              testResult={testResults[c.id]}
              isTesting={testingId === c.id}
              isScanning={scanningId === c.id}
              onTest={handleTest}
              onScan={handleScanSchema}
              onRefresh={fetchConnectors}
            />
          ))}
          {connectors.length === 0 ? (
            <EmptyState
              icon="🔌"
              title="No connectors yet"
              description="Add a database connection to begin schema discovery, mapping, and querying."
              className="md:col-span-2 lg:col-span-3"
              action={<button type="button" onClick={() => setIsModalOpen(true)} className="workspace-primary-action">Add your first connector</button>}
            />
          ) : <button
            type="button"
            onClick={() => { setIsModalOpen(true); setCreateError(null); }}
            className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-6 text-fg-subtle transition-all hover:border-accent/50 hover:bg-accent-soft hover:text-accent"
          >
            <span className="mb-2 text-2xl" aria-hidden="true">＋</span>
            <span className="text-sm font-semibold">Link another database</span>
          </button>}
        </div>
      )}

      {/* Create modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation">
          <div className="glass-strong flex w-full max-w-md flex-col gap-4 rounded-2xl p-6" role="dialog" aria-modal="true" aria-labelledby="new-connector-title">
            <div>
              <p className="workspace-eyebrow">Connection setup</p>
              <h2 id="new-connector-title" className="text-lg font-semibold text-fg">New database connector</h2>
              <p className="mt-1 text-xs text-fg-subtle">Configuration is sent through Data One&apos;s existing protected connector API.</p>
            </div>
            {createError && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 p-2 text-xs text-danger" role="alert">{createError}</div>
            )}
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="connector-name" className="text-xs text-fg-subtle">Connector name</label>
                <input
                  id="connector-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="My_Database"
                  className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="connector-type" className="text-xs text-fg-subtle">Type</label>
                <select
                  id="connector-type"
                  value={type}
                  onChange={e => { setType(e.target.value); setConfig({}); }}
                  className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                >
                  {VALID_TYPES.map(t => (
                    <option key={t} value={t}>{TYPE_META[t]?.icon} {t}</option>
                  ))}
                </select>
              </div>
              
              <DynamicConnectorForm
                connectorType={type}
                onChange={setConfig}
              />
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-xl border border-border bg-surface-overlay py-2 text-sm font-semibold text-fg-muted hover:border-border-strong hover:text-fg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="workspace-primary-action flex-1 py-2"
                >
                  {creating ? "Creating..." : "Add Connector"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schema modal */}
      {schemaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-strong flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="schema-dialog-title">
            <div className="flex justify-between items-center p-5 border-b border-border">
              <div>
                <p className="workspace-eyebrow">Discovered structure</p>
                <h2 id="schema-dialog-title" className="text-sm font-semibold text-fg">{schemaModal.name} — Schema</h2>
                <p className="text-xs text-fg-subtle">{Object.keys(schemaModal.schema).length} tables</p>
              </div>
              <button type="button" onClick={() => setSchemaModal(null)} className="text-xs font-semibold text-fg-subtle hover:text-fg">✕ Close</button>
            </div>
            <div className="overflow-y-auto p-5 flex flex-col gap-4">
              {Object.entries(schemaModal.schema).map(([table, cols]) => (
                <div key={table} className="rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2 bg-surface-overlay text-xs font-semibold text-fg-muted font-mono">
                    {table} <span className="font-normal text-fg-subtle">({cols.length} cols)</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 text-left font-medium text-fg-subtle">Column</th>
                        <th className="px-4 py-2 text-left font-medium text-fg-subtle">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cols.map(col => (
                        <tr key={col.name} className="border-b border-border/50 hover:bg-surface-overlay">
                          <td className="px-4 py-1.5 font-mono text-fg-muted">{col.name}</td>
                          <td className="px-4 py-1.5 font-mono text-fg-subtle">{col.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
