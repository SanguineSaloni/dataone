"use client";
import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import Link from "next/link";
import type { Connector, DependencyInfo } from "../lib/types";
import { DialogSurface } from "../../components";

interface DeleteConnectorDialogProps {
  connector: Connector;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteConnectorDialog({ connector, onClose, onDeleted }: DeleteConnectorDialogProps) {
  const [dependencies, setDependencies] = useState<DependencyInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DependencyInfo>(`/api/v1/connectors/${connector.id}/dependencies`)
      .then(data => setDependencies(data))
      .catch(() => setDependencies({ mappings: [], pipelines: [] }))
      .finally(() => setChecking(false));
  }, [connector.id]);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/api/v1/connectors/${connector.id}`);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete connector.");
    } finally {
      setDeleting(false);
    }
  };

  const hasDeps = dependencies && (dependencies.mappings.length > 0 || dependencies.pipelines.length > 0);
  const totalDeps = (dependencies?.mappings.length ?? 0) + (dependencies?.pipelines.length ?? 0);

  return (
    <DialogSurface title={`Delete ${connector.name}?`} description="This soft-deletes the connector. Review its dependencies before continuing." eyebrow="Destructive action" onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} disabled={deleting} className="rounded-xl border border-border bg-surface-overlay px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg disabled:opacity-50">Cancel</button>
        <button type="button" onClick={handleDelete} disabled={deleting || checking} className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{deleting ? "Deleting…" : hasDeps ? "Delete anyway" : "Delete connector"}</button>
      </>
    }>
      <div className="flex flex-col gap-4">
        {checking ? (
          <div className="flex items-center gap-2 text-xs text-fg-subtle" role="status">
            <span className="w-3 h-3 border border-border-strong border-t-transparent rounded-full animate-spin" />
            Checking dependencies…
          </div>
        ) : hasDeps ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="mb-2 text-xs font-semibold text-warning">
              ⚠️ This connector is used by {totalDeps} resource(s)
            </p>
            {dependencies!.mappings.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Mappings</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {dependencies!.mappings.slice(0, 5).map(m => (
                    <li key={m.id}>
                      <Link href="/dashboard/schema-mapper" className="text-xs text-accent hover:opacity-80">
                        🗺️ {m.name}
                      </Link>
                    </li>
                  ))}
                  {dependencies!.mappings.length > 5 && (
                    <li className="text-[10px] text-fg-subtle">+{dependencies!.mappings.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            {dependencies!.pipelines.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Pipelines</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {dependencies!.pipelines.slice(0, 5).map(p => (
                    <li key={p.id}>
                      <Link href="/dashboard/pipelines" className="text-xs text-accent hover:opacity-80">
                        🔗 {p.name}
                      </Link>
                    </li>
                  ))}
                  {dependencies!.pipelines.length > 5 && (
                    <li className="text-[10px] text-fg-subtle">+{dependencies!.pipelines.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-success/20 bg-success/5 p-3">
            <p className="text-xs text-success">✓ No dependencies — safe to delete.</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-2 text-xs text-danger" role="alert">{error}</div>
        )}

      </div>
    </DialogSurface>
  );
}
