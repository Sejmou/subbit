import { useEffect, useRef, useState } from "react";

interface Props {
  onImportProjectBundle: () => void;
  onExportProjectBundle: () => void;
  onNewBlankProject: () => void;
  onCloseProject: () => void;
  hasWaveformPeaks: boolean;
  onShowWaveformPeaks: () => void;
}

export function FileMenu({
  onImportProjectBundle,
  onExportProjectBundle,
  onNewBlankProject,
  onCloseProject,
  hasWaveformPeaks,
  onShowWaveformPeaks,
}: Props) {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setAdvancedOpen(false);
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    setAdvancedOpen(false);
    fn();
  };

  return (
    <div className="file-menu" ref={rootRef}>
      <button
        type="button"
        className="file-menu-trigger file-menu-trigger--brand"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Subbit <span aria-hidden>▾</span>
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
          <hr />
          <div
            className="file-menu-submenu"
            onMouseEnter={() => setAdvancedOpen(true)}
            onMouseLeave={() => setAdvancedOpen(false)}
            onFocus={() => setAdvancedOpen(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setAdvancedOpen(false);
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="file-menu-submenu-trigger"
              aria-haspopup="menu"
              aria-expanded={advancedOpen}
            >
              Advanced…
            </button>
            <div className="file-menu-submenu-panel" role="menu">
              <button
                type="button"
                role="menuitem"
                className="file-menu-submenu-trigger"
                onClick={() => run(onShowWaveformPeaks)}
              >
                {hasWaveformPeaks
                  ? "Replace waveform data…"
                  : "Import waveform data…"}
              </button>
            </div>
          </div>
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
