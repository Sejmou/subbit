import { useEffect, useMemo, useState } from "react";
import {
  buildExport,
  DEFAULT_DIARIZED_EXPORT_OPTIONS,
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportRequest,
} from "../lib/export-format";
import { exportFormatHint, exportPreviewSummary } from "../lib/export-hints";
import {
  cuesBeforeReferenceStart,
  referenceStartTimecode,
} from "../lib/program-start";
import { fileSecondsToSubtitleTimecode } from "../lib/frame-time";
import { useProject } from "../store/project";

interface Props {
  open: boolean;
  onExport: (request: ExportRequest) => void;
  onClose: () => void;
}

/** Choose export format and run export. */
export function ExportDialog({ open, onExport, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>("ass");
  const [speakerLabels, setSpeakerLabels] = useState(
    DEFAULT_DIARIZED_EXPORT_OPTIONS.speakerLabels,
  );
  const [speakerColors, setSpeakerColors] = useState(
    DEFAULT_DIARIZED_EXPORT_OPTIONS.speakerColors,
  );
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const project = useProject((s) => s.project);

  useEffect(() => {
    if (!open) return;
    setCopyHint(null);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!copyHint) return;
    const id = window.setTimeout(() => setCopyHint(null), 2000);
    return () => window.clearTimeout(id);
  }, [copyHint]);

  const selected =
    EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];

  const referenceStartSeconds = project?.referenceStartSeconds ?? 0;
  const beforeReference = project ? cuesBeforeReferenceStart(project) : [];
  const firstCue = project?.cues[0];

  const preview = useMemo(() => {
    if (!project || !firstCue) return null;
    return exportPreviewSummary(
      project,
      firstCue.start,
      firstCue.end,
      selected.usesDeliveryOffset,
    );
  }, [project, firstCue, selected.usesDeliveryOffset]);

  const hint = project ? exportFormatHint(selected, project) : selected.hint;

  const exportRequest = (): ExportRequest => ({
    format,
    diarized: { speakerLabels, speakerColors },
  });

  const onCopy = async () => {
    if (!project) return;
    const { content } = buildExport(project, exportRequest());
    try {
      await navigator.clipboard.writeText(content);
      setCopyHint("Copied");
    } catch {
      setCopyHint("Could not copy");
    }
  };

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

        <div className="export-time-mapping">
          <strong>Time mapping</strong>
          <p className="hint">
            Start timecode <strong>{project.startTimecode}</strong> — edit on
            the timeline toolbar.
          </p>
          <p className="hint">
            {referenceStartSeconds > 0 ? (
              <>
                Reference start at {referenceStartTimecode(project)} — export
                times count from subtitle zero. Cue positions in the editor are
                unchanged.
              </>
            ) : (
              <>
                No reference start set — export uses subtitle SMPTE from the
                start timecode. Set the reference start on the timeline toolbar.
              </>
            )}
          </p>
          {beforeReference.length > 0 && (
            <p className="export-warn">
              {beforeReference.length} invalid cue
              {beforeReference.length === 1 ? "" : "s"} start before subtitle
              start — export In times clamp to 00:00:00:00.
            </p>
          )}
        </div>

        {preview && firstCue && (
          <div className="export-preview">
            <strong>First cue export preview</strong>
            <dl className="export-preview-grid">
              <div>
                <dt>Media In / Out</dt>
                <dd>
                  {fileSecondsToSubtitleTimecode(firstCue.start, project)} →{" "}
                  {fileSecondsToSubtitleTimecode(firstCue.end, project)}
                </dd>
              </div>
              <div>
                <dt>Subtitle In / Out</dt>
                <dd>
                  {preview.subtitleIn} → {preview.subtitleOut}
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

        <div className="export-actions">
          <button type="button" onClick={() => void onCopy()}>
            Copy to clipboard
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onExport(exportRequest());
              onClose();
            }}
          >
            Export .{selected.ext}
          </button>
        </div>
        {copyHint && (
          <p className="export-copy-hint" role="status">
            {copyHint}
          </p>
        )}
      </div>
    </div>
  );
}
