import { useShortcutLabel } from "../hooks/useShortcutLabel";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Explains subtitle time mapping (start timecode + reference frame). */
export function TimeMappingHelpDialog({ open, onClose }: Props) {
  const modalRef = useModalFocusTrap(open, onClose);
  const setReference = useShortcutLabel("set-reference-frame");
  const clearReference = useShortcutLabel("clear-reference-frame");
  const seekReference = useShortcutLabel("seek-reference-frame");

  if (!open) return null;

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div
        ref={modalRef}
        className="help-modal time-mapping-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-mapping-help-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="help-modal-header">
          <div className="help-head">
            <h2 id="time-mapping-help-title">Subtitle time mapping</h2>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="help-modal-body">
          <p>
            The timeline shows <strong>subtitle SMPTE</strong> — the same times
            you edit and export. Two project settings define how file frames map
            to those timecodes:
          </p>
          <ul className="time-mapping-help-steps">
            <li>
              <strong>Start timecode</strong> — the SMPTE label at subtitle
              start (e.g. <code>00:00:00:00</code>, <code>01:00:00:00</code>, or
              any custom value).
            </li>
            <li>
              <strong>Subtitle start</strong> — which moment in the video file
              carries that label. Use this to skip leader, black, or slate at
              the head.
            </li>
          </ul>
          <h3>How to set subtitle start</h3>
          <ul className="time-mapping-help-steps">
            <li>
              Drag the orange <strong>Subtitle start</strong> marker on the
              timeline
            </li>
            <li>
              Seek with the playhead field, then click <strong>Set</strong>
            </li>
            <li>
              Press <kbd>{setReference}</kbd> to set from the current playhead
            </li>
          </ul>
          <p className="hint">
            Press <kbd>{seekReference}</kbd> to jump to subtitle start. Use{" "}
            <strong>Clear</strong> or <kbd>{clearReference}</kbd> to put
            subtitle zero at file start. Cues before subtitle start export with
            an In time at subtitle zero.
          </p>
          <p className="hint">
            Cue positions stay locked to the video file; only the displayed and
            exported timecode labels change when you adjust start timecode or
            subtitle start.
          </p>
        </div>
      </div>
    </div>
  );
}
