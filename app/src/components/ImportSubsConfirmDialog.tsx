import { useEffect, type MouseEvent } from "react";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

interface Props {
  open: boolean;
  fileName: string;
  formatLabel: string;
  isDeliverySpreadsheet: boolean;
  cueCount: number;
  busy?: boolean;
  error?: string | null;
  backupHint?: string | null;
  /** Ignore backdrop dismiss briefly after open (file picker mouse-up). */
  openedAt?: number;
  onExportBackup: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Warn before replacing cues; optional filesystem backup first. */
export function ImportSubsConfirmDialog({
  open,
  fileName,
  formatLabel,
  isDeliverySpreadsheet,
  cueCount,
  busy = false,
  error = null,
  backupHint = null,
  openedAt = 0,
  onExportBackup,
  onConfirm,
  onCancel,
}: Props) {
  const modalRef = useModalFocusTrap(open, onCancel);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  const cueLabel = cueCount === 1 ? "cue" : "cues";

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (Date.now() - openedAt < 400) return;
    onCancel();
  };

  return (
    <div className="help-backdrop" onMouseDown={onBackdropMouseDown}>
      <div
        ref={modalRef}
        className="confirm-modal import-delivery-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-subs-confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="import-subs-confirm-title">Replace all cues?</h2>
        <p>
          Importing <strong>{fileName}</strong> ({formatLabel}) will replace all{" "}
          <strong>
            {cueCount} existing {cueLabel}
          </strong>{" "}
          in this project.
          {isDeliverySpreadsheet
            ? " Speaker roles from the spreadsheet are matched by name; any timing information from previously imported transcriptions is discarded, too."
            : " Speaker labels in the file are matched by name when present."}
        </p>
        <p className="hint">
          We recommend backing up the project before importing. A backup is a{" "}
          <code>.subbit.zip</code> file with your full project (use{" "}
          <strong>Back up project</strong> in the menu or{" "}
          <strong>Back up</strong> on the toolbar). Browser storage can be
          cleared if you run low on space. The toolbar <strong>History</strong>{" "}
          button also saves <strong>pre-subs-import</strong> and{" "}
          <strong>subs-import (cues overwritten)</strong> for restore.
        </p>

        <div className="import-delivery-confirm-backup">
          <button type="button" onClick={onExportBackup} disabled={busy}>
            Back up project
          </button>
          {backupHint && (
            <p className="export-copy-hint" role="status">
              {backupHint}
            </p>
          )}
        </div>

        {error && (
          <p className="export-warn" role="alert">
            {error}
          </p>
        )}

        <div className="confirm-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Importing…" : "Replace cues and import"}
          </button>
        </div>
      </div>
    </div>
  );
}
