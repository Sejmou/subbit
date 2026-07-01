import { useEffect, type MouseEvent } from "react";
import { formatRelativeTime } from "../lib/relative-time";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

interface Props {
  open: boolean;
  projectName: string;
  bundleFileName: string;
  cueCount: number;
  savedAt: number | null;
  busy?: boolean;
  openedAt?: number;
  onReplace: () => void;
  onOpenCopy: () => void;
  onCancel: () => void;
}

/** Ask before a bundle import would overwrite an existing browser project. */
export function ImportBundleConflictDialog({
  open,
  projectName,
  bundleFileName,
  cueCount,
  savedAt,
  busy = false,
  openedAt = 0,
  onReplace,
  onOpenCopy,
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
  const savedLabel =
    savedAt != null
      ? `Last saved in this browser ${formatRelativeTime(savedAt)}.`
      : "This project is already saved in this browser.";

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (Date.now() - openedAt < 400) return;
    onCancel();
  };

  return (
    <div className="help-backdrop" onMouseDown={onBackdropMouseDown}>
      <div
        ref={modalRef}
        className="confirm-modal import-bundle-conflict"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-bundle-conflict-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="import-bundle-conflict-title">Replace saved project?</h2>
        <p>
          <strong>{bundleFileName}</strong> matches an existing project,{" "}
          <strong>{projectName}</strong> ({cueCount} {cueLabel}), already stored
          in this browser. The backup file differs from the saved copy.{" "}
          {savedLabel}
        </p>
        <p className="hint">
          Replacing saves a <strong>before backup restore</strong> snapshot in{" "}
          <strong>History</strong>, then restores the backup as{" "}
          <strong>backup restore ({bundleFileName})</strong>. Opening as a new
          copy keeps the existing project unchanged.
        </p>
        <div className="confirm-actions import-bundle-conflict-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={onOpenCopy} disabled={busy}>
            Open as new copy
          </button>
          <button
            type="button"
            className="danger"
            onClick={onReplace}
            disabled={busy}
          >
            {busy ? "Restoring…" : "Replace saved copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
