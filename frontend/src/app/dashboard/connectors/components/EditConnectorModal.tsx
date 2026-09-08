"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Connector } from "../lib/types";
import { DialogSurface } from "../../components";

interface EditConnectorModalProps {
  connector: Connector;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditConnectorModal({ connector, onClose, onSaved }: EditConnectorModalProps) {
  const [name, setName] = useState(connector.name);
  const [configJson, setConfigJson] = useState(JSON.stringify(connector.config, null, 2));
  const [rotateSecret, setRotateSecret] = useState(false);
  const [newSecret, setNewSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(configJson);
    } catch {
      setError("Invalid JSON in config field.");
      return;
    }

    setSaving(true);
    try {
      await api.put(`/api/v1/connectors/${connector.id}`, {
        name,
        config: parsedConfig,
        ...(rotateSecret && newSecret ? { new_secret: newSecret } : {}),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update connector.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogSurface title={`Edit ${connector.name}`} description={`Update the ${connector.type} connection configuration.`} eyebrow="Connector settings" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-2 text-xs text-danger" role="alert">{error}</div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-connector-name" className="text-xs text-fg-subtle">Connector name</label>
            <input
              id="edit-connector-name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="My_Database"
              className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-connector-type" className="text-xs text-fg-subtle">Type</label>
            <input
              id="edit-connector-type"
              value={connector.type}
              disabled
              className="cursor-not-allowed rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-fg-subtle"
            />
            <span className="text-[10px] text-fg-subtle mt-0.5">Type cannot be changed after creation.</span>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-connector-config" className="text-xs text-fg-subtle">Configuration JSON</label>
            <textarea
              id="edit-connector-config"
              value={configJson}
              onChange={e => setConfigJson(e.target.value)}
              required
              rows={4}
              className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 font-mono text-xs text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div className="border-t border-border pt-3">
            <label className="flex items-center gap-2 text-xs text-fg-subtle cursor-pointer">
              <input
                type="checkbox"
                checked={rotateSecret}
                onChange={e => setRotateSecret(e.target.checked)}
                className="rounded border-border-strong bg-surface-overlay"
              />
              Rotate credentials
            </label>
            {rotateSecret && (
              <div className="mt-2 flex flex-col gap-1">
                <label htmlFor="edit-connector-secret" className="text-xs text-fg-subtle">New credentials (JSON)</label>
                <textarea
                  id="edit-connector-secret"
                  value={newSecret}
                  onChange={e => setNewSecret(e.target.value)}
                  rows={2}
                  placeholder='{"password": "new_secret_value"}'
                  className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 font-mono text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-surface-overlay py-2 text-sm font-semibold text-fg-muted hover:border-border-strong hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="workspace-primary-action flex-1 py-2"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </DialogSurface>
  );
}
