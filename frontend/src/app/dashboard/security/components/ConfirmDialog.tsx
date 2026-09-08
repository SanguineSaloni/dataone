"use client";
import { DialogSurface } from "../../components";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Generic confirmation modal for privileged/destructive Security Admin
 * actions (FR8/AC3) — role deletion, revoking a user's last role, etc. */
export default function ConfirmDialog({
  title, message, confirmLabel = "Confirm", danger = true, busy = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <DialogSurface title={title} description={message} eyebrow={danger ? "Destructive action" : "Confirmation"} onClose={onCancel} footer={
      <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-border bg-surface-overlay px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              danger ? "bg-danger hover:opacity-90" : "workspace-primary-action"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
      </>
    }>
      <p className="whitespace-pre-line text-sm text-fg-muted">Review the details above before continuing.</p>
    </DialogSurface>
  );
}
