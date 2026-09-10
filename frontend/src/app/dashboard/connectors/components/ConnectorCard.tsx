"use client";
import { useState } from "react";
import type { Connector } from "../lib/types";
import { HEALTH_META, TYPE_META } from "../lib/types";
import EditConnectorModal from "./EditConnectorModal";
import DeleteConnectorDialog from "./DeleteConnectorDialog";
import CredentialRotationModal from "./CredentialRotationModal";
import ConnectorAuditLog from "./ConnectorAuditLog";
import { Card } from "../../components";

interface ConnectorCardProps {
  connector: Connector;
  testResult?: { status: string; detail?: string };
  isTesting: boolean;
  isScanning: boolean;
  onTest: (id: number) => void;
  onScan: (id: number) => void;
  onRefresh: () => void;
  isWorkspaceConnector?: boolean;
}

export default function ConnectorCard({ connector, testResult, isTesting, isScanning, onTest, onScan, onRefresh, isWorkspaceConnector = false }: ConnectorCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const meta = TYPE_META[connector.type] ?? TYPE_META.sqlite;
  const test = testResult;
  const health = test?.status === "connected" ? HEALTH_META.healthy
    : test?.status === "failed" ? HEALTH_META.down
    : HEALTH_META[connector.health_status ?? "unknown"] ?? HEALTH_META.unknown;
  const statusDetail = test?.detail ?? connector.last_test_error ?? undefined;

  return (
    <>
      <Card variant="glass" padding="md" hoverable className="group relative flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.bgColor} ${meta.color}`}>
              {meta.icon} {connector.type}
            </span>
            <h4 className="font-semibold text-fg-muted mt-2">{connector.name}</h4>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 text-xs ${health.text}`}
              title={statusDetail}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
              {test?.status === "testing" ? "Testing..." : health.label}
            </span>
            {/* Three-dot menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                aria-label={`Open actions for ${connector.name}`}
                aria-expanded={showMenu}
                className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-overlay hover:text-fg"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {showMenu && (
                <>
                  <button type="button" aria-label="Close connector actions" className="fixed inset-0 z-40 cursor-default" onClick={() => setShowMenu(false)} />
                  <div className="glass-strong absolute right-0 top-9 z-50 w-48 rounded-xl py-1" role="menu">
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); setShowEdit(true); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-fg-muted hover:bg-surface-overlay"
                      role="menuitem"
                    >
                      ✎ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); setShowRotate(true); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-fg-muted hover:bg-surface-overlay"
                      role="menuitem"
                    >
                      🔑 Rotate Credentials
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); setShowAudit(true); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-fg-muted hover:bg-surface-overlay"
                      role="menuitem"
                    >
                      📋 View Activity
                    </button>
                    <div className="border-t border-border-strong my-1" />
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); setShowDelete(true); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-danger hover:bg-danger/10"
                      role="menuitem"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-border/50 pt-3 text-xs text-fg-subtle">
          <span className="block truncate font-mono text-[10px]" title={JSON.stringify(connector.config)}>{JSON.stringify(connector.config)}</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => onTest(connector.id)}
            disabled={isTesting}
            className="flex-1 rounded-lg border border-border bg-surface-overlay py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-accent/30 hover:text-accent disabled:opacity-50"
          >
            {isTesting ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            onClick={() => onScan(connector.id)}
            disabled={isScanning}
            className="flex-1 rounded-lg border border-border bg-surface-overlay py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-accent/30 hover:text-accent disabled:opacity-50"
          >
            {isScanning ? "Scanning..." : "Scan Schema"}
          </button>
        </div>
      </Card>

      {showEdit && (
        <EditConnectorModal
          connector={connector}
          onClose={() => setShowEdit(false)}
          onSaved={onRefresh}
        />
      )}
      {showDelete && (
        <DeleteConnectorDialog
          connector={connector}
          onClose={() => setShowDelete(false)}
          onDeleted={onRefresh}
        />
      )}
      {showRotate && (
        <CredentialRotationModal
          connector={connector}
          onClose={() => setShowRotate(false)}
          onRotated={onRefresh}
        />
      )}
      {showAudit && (
        <ConnectorAuditLog
          connectorId={connector.id}
          connectorName={connector.name}
          onClose={() => setShowAudit(false)}
        />
      )}
    </>
  );
}
