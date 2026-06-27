import { useEffect } from "react";

interface Props {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/** Three-way prompt when leaving a project with unsaved edits. */
export function UnsavedDialog({ open, onSave, onDiscard, onCancel }: Props) {
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

  return (
    <div className="help-backdrop" onMouseDown={onCancel}>
      <div className="confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Unsaved changes</h2>
        <p>Save your work before continuing?</p>
        <div className="confirm-actions">
          <button className="primary" onClick={onSave}>
            Save
          </button>
          <button onClick={onDiscard}>Don&apos;t save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
