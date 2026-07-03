import { useEffect, useRef, useState } from "react";
import { EXPORT_FORMATS, type ExportFormat } from "../lib/export-format";
import {
  defaultImportRequest,
  importAcceptForFormat,
  type ImportRequest,
} from "../lib/import-format";
import { exportFormatInfo } from "../lib/export-format";
import { DeliveryColumnMappingFields } from "./DeliveryColumnMappingFields";
import { ImportSubsConfirmDialog } from "./ImportSubsConfirmDialog";
import type { DeliveryColumnMapping } from "../lib/delivery-columns";
import { DEFAULT_DELIVERY_COLUMNS } from "../lib/delivery-columns";

interface PendingImport {
  request: ImportRequest;
  file: File;
}

interface Props {
  open: boolean;
  cueCount: number;
  onExportBackup: () => void;
  onConfirmImport: (request: ImportRequest, file: File) => Promise<void>;
  onClose: () => void;
}

/** Pick format/file, then confirm before replacing cues. */
export function ImportSubsDialog({
  open,
  cueCount,
  onExportBackup,
  onConfirmImport,
  onClose,
}: Props) {
  const [format, setFormat] = useState<ExportFormat>("ass");
  const [deliveryColumns, setDeliveryColumns] = useState<DeliveryColumnMapping>(
    { ...DEFAULT_DELIVERY_COLUMNS },
  );
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupHint, setBackupHint] = useState<string | null>(null);
  const confirmOpenedAt = useRef(0);

  const selected = exportFormatInfo(format);

  useEffect(() => {
    if (!open) return;
    setFormat("ass");
    setDeliveryColumns({ ...DEFAULT_DELIVERY_COLUMNS });
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

  const buildRequest = (): ImportRequest => ({
    ...defaultImportRequest(format),
    deliveryColumns,
  });

  const onPickFile = () => {
    setError(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = importAcceptForFormat(format);
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      confirmOpenedAt.current = Date.now();
      setPending({ request: buildRequest(), file });
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
      await onConfirmImport(pending.request, pending.file);
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
              <h2>Import subtitles</h2>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>

            <label className="export-field">
              Format
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
              >
                {EXPORT_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <p className="hint export-hint">{selected.hint}</p>

            {selected.isDeliverySpreadsheet && (
              <DeliveryColumnMappingFields
                value={deliveryColumns}
                onChange={setDeliveryColumns}
              />
            )}

            <div className="export-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={onPickFile}>
                Choose .{selected.ext} file…
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportSubsConfirmDialog
        open={pending != null}
        fileName={pending?.file.name ?? ""}
        formatLabel={selected.label}
        isDeliverySpreadsheet={selected.isDeliverySpreadsheet}
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
