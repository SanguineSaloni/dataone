"use client";
import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import type { AuditEvent } from "../lib/types";
import { DialogSurface, EmptyState, ErrorState, LoadingState } from "../../components";

interface ConnectorAuditLogProps {
  connectorId: number;
  connectorName: string;
  onClose: () => void;
}

export default function ConnectorAuditLog({ connectorId, connectorName, onClose }: ConnectorAuditLogProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AuditEvent[]>(`/api/v1/audit?target_type=connection&target_id=${connectorId}&page_size=20`)
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error("Failed to fetch audit events:", err);
        setError(err instanceof ApiError ? err.message : "Unable to load connector activity.");
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [connectorId]);

  return (
    <DialogSurface title={`Activity — ${connectorName}`} description="Recent audited actions for this connector." eyebrow="Audit trail" onClose={onClose} width="md">
      <div className="min-w-0 overflow-x-auto">
          {loading ? (
            <LoadingState label="Loading connector activity…" />
          ) : error ? (
            <ErrorState title="Activity could not be loaded" message={error} />
          ) : events.length === 0 ? (
            <EmptyState icon="📋" title="No activity yet" description="Events appear after this connector is created, tested, edited, rotated, or deleted." />
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2 font-semibold text-fg-subtle">Timestamp</th>
                  <th className="p-2 font-semibold text-fg-subtle">Action</th>
                  <th className="p-2 font-semibold text-fg-subtle">Actor</th>
                  <th className="p-2 font-semibold text-fg-subtle">Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, i) => (
                  <tr key={event.id ?? i} className="border-b border-border/60 hover:bg-surface-overlay">
                    <td className="p-2 text-fg-subtle whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="p-2">
                      <span className="font-semibold text-fg-muted">{event.action}</span>
                    </td>
                    <td className="p-2 text-fg-subtle">{event.actor}</td>
                    <td className="max-w-[200px] truncate p-2 text-fg-subtle" title={event.details}>{event.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </DialogSurface>
  );
}
