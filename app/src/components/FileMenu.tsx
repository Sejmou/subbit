import { useEffect, useRef, useState } from "react";

interface Props {
  onImportProjectBundle: () => void;
  onExportProjectBundle: () => void;
  onNewBlankProject: () => void;
  onImportWhisperx: () => void;
  onImportWaveform: () => void;
  onCloseProject: () => void;
}

export function FileMenu({
  onImportProjectBundle,
  onExportProjectBundle,
  onNewBlankProject,
  onImportWhisperx,
  onImportWaveform,
  onCloseProject,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="file-menu" ref={rootRef}>
      <button
        type="button"
        className="file-menu-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        File ▾
      </button>
      {open && (
        <div className="file-menu-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onImportProjectBundle)}
          >
            Import project bundle…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onExportProjectBundle)}
          >
            Export project bundle…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onNewBlankProject)}
          >
            New blank project…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onImportWhisperx)}
          >
            Import whisperx…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onImportWaveform)}
          >
            Import waveform…
          </button>
          <hr />
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onCloseProject)}
          >
            Close project
          </button>
        </div>
      )}
    </div>
  );
}
