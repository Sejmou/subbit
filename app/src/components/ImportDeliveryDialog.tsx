import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_DELIVERY_COLUMNS,
  type DeliveryColumnMapping,
} from "../lib/delivery-columns";
import { DeliveryColumnMappingFields } from "./DeliveryColumnMappingFields";
import { ImportDeliveryConfirmDialog } from "./ImportDeliveryConfirmDialog";

interface PendingImport {
  columns: DeliveryColumnMapping;
  file: File;
}

interface Props {
  open: boolean;
  cueCount: number;
  onExportBackup: () => void;
  onConfirmImport: (
    columns: DeliveryColumnMapping,
    file: File,
  ) => Promise<void>;
  onClose: () => void;
}

/** Pick columns/file, then confirm before replacing cues. */
export function ImportDeliveryDialog({
  open,
  cueCount,
  onExportBackup,
  onConfirmImport,
  onClose,
}: Props) {
  const [columns, setColumns] = useState<DeliveryColumnMapping>({
    ...DEFAULT_DELIVERY_COLUMNS,
  });
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupHint, setBackupHint] = useState<string | null>(null);
  const confirmOpenedAt = useRef(0);

  useEffect(() => {
    if (!open) return;
    setColumns({ ...DEFAULT_DELIVERY_COLUMNS });
    setPending(null);
    setBusy(false);
    setError(null);
    setBackupHint(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, pending]);

  useEffect(() => {
    if (!backupHint) return;
    const id = window.setTimeout(() => setBackupHint(null), 2000);
    return () => window.clearTimeout(id);
  }, [backupHint]);

  const onPickFile = () => {
    setError(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      confirmOpenedAt.current = Date.now();
      setPending({ columns: { ...columns }, file });
    });
    document.body.appendChild(input);
    input.click();
  };

  const cancelConfirm = () => {
    setPending(null);
    setError(null);
    setBackupHint(null);
  };

  const runImport = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirmImport(pending.columns, pending.file);
      setPending(null);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = () => {
    onExportBackup();
    setBackupHint("Download started");
  };

  if (!open) return null;

  return (
    <>
      {!pending && (
        <div className="help-backdrop" onMouseDown={onClose}>
          <div
            className="export-modal import-delivery-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="export-head">
              <h2>Import delivery spreadsheet</h2>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>

            <p className="hint export-hint">
              Choose an Excel file with delivery columns. You can map header
              names on the next step before confirming the import.
            </p>

            <DeliveryColumnMappingFields
              value={columns}
              onChange={setColumns}
            />

            <div className="export-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={onPickFile}>
                Choose .xlsx file…
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportDeliveryConfirmDialog
        open={pending != null}
        fileName={pending?.file.name ?? ""}
        cueCount={cueCount}
        busy={busy}
        error={error}
        backupHint={backupHint}
        openedAt={confirmOpenedAt.current}
        onExportBackup={exportBackup}
        onConfirm={() => void runImport()}
        onCancel={cancelConfirm}
      />
    </>
  );
}
