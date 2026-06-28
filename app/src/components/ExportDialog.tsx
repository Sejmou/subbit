import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_DIARIZED_EXPORT_OPTIONS,
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportRequest,
} from "../lib/export-format";
import { exportFormatHint, exportPreviewSummary } from "../lib/export-hints";
import {
  contentStartSeconds,
  cuesBeforeProgramStart,
  programStartTimecode,
} from "../lib/program-start";
import { secondsToTimecode } from "../lib/timecode";
import { useProject } from "../store/project";
import { useTip } from "./Tooltip";

interface Props {
  open: boolean;
  onExport: (request: ExportRequest) => void;
  onClose: () => void;
}

/** Choose export format and run export. */
export function ExportDialog({ open, onExport, onClose }: Props) {
  const tip = useTip();
  const [format, setFormat] = useState<ExportFormat>("ass");
  const [speakerLabels, setSpeakerLabels] = useState(
    DEFAULT_DIARIZED_EXPORT_OPTIONS.speakerLabels,
  );
  const [speakerColors, setSpeakerColors] = useState(
    DEFAULT_DIARIZED_EXPORT_OPTIONS.speakerColors,
  );
  const project = useProject((s) => s.project);
  const timecodeOffset = project?.timecodeOffset ?? "";
  const setTimecodeOffset = useProject((s) => s.setTimecodeOffset);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const selected =
    EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];

  const contentStart = project ? contentStartSeconds(project) : 0;
  const beforeProgram = project ? cuesBeforeProgramStart(project) : [];
  const firstCue = project?.cues[0];

  const preview = useMemo(() => {
    if (!project || !firstCue) return null;
    return exportPreviewSummary(
      firstCue.start,
      firstCue.end,
      contentStart,
      project.fps,
      project.timecodeOffset,
      selected.usesDeliveryOffset,
    );
  }, [project, firstCue, contentStart, selected.usesDeliveryOffset]);

  const hint = project
    ? exportFormatHint(selected, contentStart, project.fps)
    : selected.hint;

  if (!open || !project) return null;

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div className="export-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="export-head">
          <h2>Export</h2>
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

        <p className="hint export-hint">{hint}</p>

        <div className="export-program-start">
          <strong>Program start</strong>
          <p className="hint">
            {contentStart > 0 ? (
              <>
                File {programStartTimecode(project)} — export times count from
                here. Cue positions in the editor are unchanged.
              </>
            ) : (
              <>
                Not set — export times match the file from 00:00:00. Set program
                start on the timeline toolbar.
              </>
            )}
          </p>
          {beforeProgram.length > 0 && (
            <p className="export-warn">
              {beforeProgram.length} cue{beforeProgram.length === 1 ? "" : "s"}{" "}
              start before program start — export In times clamp to 00:00:00:00.
            </p>
          )}
        </div>

        {preview && firstCue && (
          <div className="export-preview">
            <strong>First cue export preview</strong>
            <dl className="export-preview-grid">
              <div>
                <dt>File In / Out</dt>
                <dd>
                  {secondsToTimecode(
                    firstCue.start,
                    project.fps,
                    "00:00:00:00",
                  )}{" "}
                  →{" "}
                  {secondsToTimecode(firstCue.end, project.fps, "00:00:00:00")}
                </dd>
              </div>
              <div>
                <dt>Program In / Out</dt>
                <dd>
                  {preview.programIn} → {preview.programOut}
                </dd>
              </div>
              {preview.deliveryIn && preview.deliveryOut && (
                <div>
                  <dt>Delivery In / Out</dt>
                  <dd>
                    {preview.deliveryIn} → {preview.deliveryOut}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {selected.supportsDiarization && (
          <div className="export-options">
            <label className="export-check">
              <input
                type="checkbox"
                checked={speakerLabels}
                onChange={(e) => setSpeakerLabels(e.target.checked)}
              />
              Speaker labels
            </label>
            <label className="export-check">
              <input
                type="checkbox"
                checked={speakerColors}
                onChange={(e) => setSpeakerColors(e.target.checked)}
              />
              Speaker colors
            </label>
          </div>
        )}

        {selected.usesDeliveryOffset && (
          <>
            <label className="export-field">
              Broadcast offset
              <input
                value={timecodeOffset}
                onChange={(e) => setTimecodeOffset(e.target.value)}
                size={11}
                spellCheck={false}
                {...tip(
                  "Added on top of program time for SMPTE delivery (HH:MM:SS:FF)",
                )}
              />
            </label>
            <p className="hint">
              Delivery timecode = program time + this offset (separate from
              program start).
            </p>
          </>
        )}

        <button
          type="button"
          className="primary wide export-action"
          onClick={() => {
            onExport({
              format,
              diarized: { speakerLabels, speakerColors },
            });
            onClose();
          }}
        >
          Export .{selected.ext}
        </button>
      </div>
    </div>
  );
}
