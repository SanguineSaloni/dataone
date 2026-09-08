"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Connector, TestResponse } from "../lib/types";
import { DialogSurface } from "../../components";

interface CredentialRotationModalProps {
  connector: Connector;
  onClose: () => void;
  onRotated: () => void;
}

export default function CredentialRotationModal({ connector, onClose, onRotated }: CredentialRotationModalProps) {
  const [newSecret, setNewSecret] = useState("");
  const [testResult, setTestResult] = useState<{ status: string; detail?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      let parsedSecret: Record<string, unknown>;
      try {
        parsedSecret = JSON.parse(newSecret);
      } catch {
        setError("Invalid JSON in credentials field.");
        setTesting(false);
        return;
      }
      const result = await api.post<TestResponse>(`/api/v1/connectors/${connector.id}/test`, {
        config: { ...connector.config, ...parsedSecret },
      });
      setTestResult({
        status: result.status,
        detail: result.status === "connected"
          ? [result.diagnostics?.version, result.diagnostics?.latency_ms != null ? `${result.diagnostics.latency_ms} ms` : null].filter(Boolean).join(" · ")
          : result.error?.message,
      });
    } catch (err) {
      setTestResult({ status: "failed", detail: err instanceof ApiError ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let parsedSecret: Record<string, unknown>;
      try {
        parsedSecret = JSON.parse(newSecret);
      } catch {
        setError("Invalid JSON in credentials field.");
        setSaving(false);
        return;
      }
      await api.post(`/api/v1/connectors/${connector.id}/rotate`, { new_secret: parsedSecret });
      onRotated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rotate credentials.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogSurface title="Rotate credentials" description={`Replace the stored credentials for ${connector.name}. New values are never displayed after saving.`} eyebrow="Protected operation" onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="rounded-xl border border-border bg-surface-overlay px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg">Cancel</button>
        <button type="button" onClick={handleTest} disabled={testing || !newSecret.trim()} className="rounded-xl border border-border-strong bg-surface-overlay px-4 py-2 text-sm font-semibold text-fg-muted hover:border-accent/30 hover:text-accent disabled:opacity-50">{testing ? "Testing…" : "Test credentials"}</button>
        <button type="button" onClick={handleSave} disabled={saving || !newSecret.trim()} className="workspace-primary-action">{saving ? "Saving…" : "Save credentials"}</button>
      </>
    }>
      <div className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-2 text-xs text-danger" role="alert">{error}</div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="rotation-credentials" className="text-xs text-fg-subtle">New credentials (JSON)</label>
          <textarea
            id="rotation-credentials"
            value={newSecret}
            onChange={e => setNewSecret(e.target.value)}
            rows={4}
            placeholder='{"password": "new_secret_value", "api_key": "new_key"}'
            className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 font-mono text-xs text-fg focus:border-accent focus:outline-none"
          />
        </div>

        {testResult && (
          <div className={`rounded-lg border p-3 text-xs ${
            testResult.status === "connected"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`} role="status">
            <span className="font-semibold">{testResult.status === "connected" ? "✓ Connected" : "✗ Failed"}</span>
            {testResult.detail && <span className="ml-2 opacity-80">{testResult.detail}</span>}
          </div>
        )}

      </div>
    </DialogSurface>
  );
}
