import { useShortcutLabel } from "../hooks/useShortcutLabel";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Explains program start and how it affects editing vs export. */
export function ProgramStartHelpDialog({ open, onClose }: Props) {
  const modalRef = useModalFocusTrap(open, onClose);
  const setFromPlayhead = useShortcutLabel("set-program-start");
  const clearStart = useShortcutLabel("clear-program-start");
  const seekStart = useShortcutLabel("seek-program-start");

  if (!open) return null;

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div
        ref={modalRef}
        className="help-modal program-start-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-start-help-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="help-modal-header">
          <div className="help-head">
            <h2 id="program-start-help-title">Program start</h2>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="help-modal-body">
          <p>
            Use program start when the video file has leader, black, or slate at
            the head and the actual video content begins later.
          </p>
          <p>
            Cue times in the editor always stay on the{" "}
            <strong>file timeline</strong>. Only <strong>exported</strong>{" "}
            subtitle times are shifted so program time 00:00:00:00 lines up with
            where the video content begins.
          </p>
          <h3>How to set it</h3>
          <ul className="program-start-help-steps">
            <li>
              Drag the orange <strong>Program start</strong> marker on the
              timeline
            </li>
            <li>
              Type a timecode in the toolbar field, or click{" "}
              <strong>Set</strong>
            </li>
            <li>
              Press <kbd>{setFromPlayhead}</kbd> to set from the current
              playhead position
            </li>
          </ul>
          <p className="hint">
            Press <kbd>{seekStart}</kbd> to jump to program start. Use{" "}
            <strong>Clear</strong> or <kbd>{clearStart}</kbd> to reset export
            times to the file start. Cues that begin before program start export
            with an In time of 00:00:00:00.
          </p>
        </div>
      </div>
    </div>
  );
}
