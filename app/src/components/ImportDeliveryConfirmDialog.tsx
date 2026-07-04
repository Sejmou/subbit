import { useEffect, type MouseEvent } from "react";
import type { ShotType } from "../types";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { shotDisplayLabel } from "../lib/shot-display";

interface Props {
  open: boolean;
  fileName: string;
  cueCount: number;
  addedShots?: ShotType[];
  previewBusy?: boolean;
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
export function ImportDeliveryConfirmDialog({
  open,
  fileName,
  cueCount,
  addedShots = [],
  previewBusy = false,
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
        aria-labelledby="import-delivery-confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="import-delivery-confirm-title">Replace all cues?</h2>
        <p>
          Importing <strong>{fileName}</strong> will replace all{" "}
          <strong>
            {cueCount} existing {cueLabel}
          </strong>{" "}
          in this project. Speaker roles from the spreadsheet are matched by
          name; any timing information from previously imported transcriptions
          is discarded, too.
        </p>
        <p className="hint">
          We recommend backing up the project before importing. A backup is a{" "}
          <code>.subbit.zip</code> file with your full project (use{" "}
          <strong>Back up project</strong> in the menu or{" "}
          <strong>Back up</strong> on the toolbar). Browser storage can be
          cleared if you run low on space. The toolbar <strong>History</strong>{" "}
          button also saves <strong>pre-excel-import</strong> and{" "}
          <strong>excel-import (cues overwritten)</strong> for restore.
        </p>

        {previewBusy && (
          <p className="hint" role="status">
            Checking shot labels…
          </p>
        )}
        {!previewBusy && addedShots.length > 0 && (
          <p className="hint" role="status">
            New shot types from the spreadsheet will be added:{" "}
            <strong>
              {addedShots
                .map((shot) => shotDisplayLabel(shot.id, shot.label))
                .join(", ")}
            </strong>
            . You can rename their labels in the Shot types panel after import.
          </p>
        )}

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
