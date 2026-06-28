import { useEffect, useMemo, useState } from "react";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import {
  WAVEFORM_GEN_SAMPLE_RATE,
  peaksMaxZoomVisibleSeconds,
  peaksPixelsPerSecondForZoom,
  waveformGenSamplesPerPixel,
} from "../lib/waveform-peaks";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: () => void;
  importEnabled: boolean;
  /** Live timeline width in layout (CSS) pixels. */
  timelineWidthPx: number;
  videoDurationSeconds?: number | null;
  sourceName?: string | null;
  hasRealPeaks: boolean;
  /** Loaded video file name for default CLI paths. */
  videoName?: string | null;
}

const DEFAULT_TARGET_MAX_ZOOM_SECONDS = 10;
const MIN_TARGET_MAX_ZOOM_SECONDS = 1;
const MAX_TARGET_MAX_ZOOM_SECONDS = 60;
const MIN_TIMELINE_WIDTH_PX = 320;
const TARGET_ZOOM_PRESETS = [5, 10, 20, 30, 60] as const;
const CUSTOM_VALUE = "custom";
const CURRENT_TIMELINE_WIDTH_VALUE = "current";

function isTargetPreset(
  value: number,
): value is (typeof TARGET_ZOOM_PRESETS)[number] {
  return (TARGET_ZOOM_PRESETS as readonly number[]).includes(value);
}

function clampTargetSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TARGET_MAX_ZOOM_SECONDS;
  return Math.min(
    MAX_TARGET_MAX_ZOOM_SECONDS,
    Math.max(MIN_TARGET_MAX_ZOOM_SECONDS, value),
  );
}

function clampTimelineWidth(value: number): number {
  if (!Number.isFinite(value)) return MIN_TIMELINE_WIDTH_PX;
  return Math.max(MIN_TIMELINE_WIDTH_PX, Math.round(value));
}

function parseOptionalInt(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PLACEHOLDER_VIDEO_INPUT = "video.mp4";
const PLACEHOLDER_PEAKS_OUTPUT = "video-waveforms.dat";

function effectiveVideoInput(raw: string): string {
  return raw.trim() || PLACEHOLDER_VIDEO_INPUT;
}

function effectivePeaksOutput(
  videoInputRaw: string,
  peaksOutputRaw: string,
): string {
  const trimmed = peaksOutputRaw.trim();
  if (trimmed) return trimmed;
  return peaksOutputPathForVideo(effectiveVideoInput(videoInputRaw));
}

function peaksOutputPathForVideo(videoInput: string): string {
  const trimmed = effectiveVideoInput(videoInput);
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const file = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const dir = slash >= 0 ? trimmed.slice(0, slash + 1) : "";
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  return `${dir}${stem}-waveforms.dat`;
}

function wavPathForVideo(videoInput: string): string {
  const trimmed = effectiveVideoInput(videoInput);
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const file = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const dir = slash >= 0 ? trimmed.slice(0, slash + 1) : "";
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  return `${dir}${stem}.wav`;
}

function shellArg(path: string): string {
  if (!/[\s"'\\]/.test(path)) return path;
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function waveformCommands(
  pixelsPerSecond: number,
  videoInputRaw: string,
  peaksOutputRaw: string,
) {
  const video = shellArg(effectiveVideoInput(videoInputRaw));
  const output = shellArg(effectivePeaksOutput(videoInputRaw, peaksOutputRaw));
  const wav = shellArg(wavPathForVideo(videoInputRaw));
  const px = String(pixelsPerSecond);
  return {
    twoStep: `ffmpeg -i ${video} -vn -ac 1 -ar 44100 ${wav}
audiowaveform -i ${wav} -o ${output} -b 8 --pixels-per-second ${px}`,
    oneLiner: `ffmpeg -i ${video} -vn -ac 1 -ar 44100 -f wav - \\
  | audiowaveform -i - -o ${output} -b 8 --pixels-per-second ${px}`,
  };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Explains timeline-only mode and how to generate waveform peaks. */
export function WaveformPeaksHelpDialog({
  open,
  onClose,
  onImport,
  importEnabled,
  timelineWidthPx,
  videoDurationSeconds,
  sourceName,
  hasRealPeaks,
  videoName,
}: Props) {
  const modalRef = useModalFocusTrap(open, onClose);
  const [targetSeconds, setTargetSeconds] = useState(
    DEFAULT_TARGET_MAX_ZOOM_SECONDS,
  );
  const [targetCustom, setTargetCustom] = useState(false);
  const [customTargetInput, setCustomTargetInput] = useState(
    String(DEFAULT_TARGET_MAX_ZOOM_SECONDS),
  );
  const [widthCustom, setWidthCustom] = useState(false);
  const [widthPx, setWidthPx] = useState(timelineWidthPx);
  const [customWidthInput, setCustomWidthInput] = useState(
    String(timelineWidthPx),
  );
  const [videoInputPath, setVideoInputPath] = useState("");
  const [peaksOutputPath, setPeaksOutputPath] = useState("");
  const [copyHint, setCopyHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVideoInputPath("");
    setPeaksOutputPath("");
    const nextWidth = clampTimelineWidth(timelineWidthPx);
    setWidthPx(nextWidth);
    setCustomWidthInput(String(nextWidth));
    setWidthCustom(false);
    setTargetSeconds(DEFAULT_TARGET_MAX_ZOOM_SECONDS);
    setTargetCustom(false);
    setCustomTargetInput(String(DEFAULT_TARGET_MAX_ZOOM_SECONDS));
    setCopyHint(null);
  }, [open]);

  useEffect(() => {
    if (!copyHint) return;
    const id = window.setTimeout(() => setCopyHint(null), 2000);
    return () => window.clearTimeout(id);
  }, [copyHint]);

  const measuredWidthPx = clampTimelineWidth(timelineWidthPx);
  const safeTargetSeconds = clampTargetSeconds(targetSeconds);
  const safeWidthPx = widthCustom
    ? clampTimelineWidth(widthPx)
    : measuredWidthPx;
  const targetSelectValue =
    targetCustom || !isTargetPreset(safeTargetSeconds)
      ? CUSTOM_VALUE
      : String(safeTargetSeconds);
  const widthSelectValue = widthCustom
    ? CUSTOM_VALUE
    : CURRENT_TIMELINE_WIDTH_VALUE;

  const commitCustomTarget = () => {
    const parsed = parseOptionalInt(customTargetInput);
    const next = clampTargetSeconds(parsed ?? safeTargetSeconds);
    setTargetSeconds(next);
    setCustomTargetInput(String(next));
    setTargetCustom(!isTargetPreset(next));
  };

  const commitCustomWidth = () => {
    const parsed = parseOptionalInt(customWidthInput);
    const next = clampTimelineWidth(parsed ?? safeWidthPx);
    setWidthPx(next);
    setCustomWidthInput(String(next));
    setWidthCustom(next !== measuredWidthPx);
  };

  const pixelsPerSecond = useMemo(
    () => peaksPixelsPerSecondForZoom(safeTargetSeconds, safeWidthPx),
    [safeTargetSeconds, safeWidthPx],
  );

  const estimatedMaxZoomSeconds = useMemo(() => {
    const samplesPerPixel = waveformGenSamplesPerPixel(
      WAVEFORM_GEN_SAMPLE_RATE,
      pixelsPerSecond,
    );
    return peaksMaxZoomVisibleSeconds(
      samplesPerPixel,
      WAVEFORM_GEN_SAMPLE_RATE,
      safeWidthPx,
    );
  }, [pixelsPerSecond, safeWidthPx]);

  const estimatedFileBytes = useMemo(() => {
    if (
      !Number.isFinite(videoDurationSeconds) ||
      !videoDurationSeconds ||
      videoDurationSeconds <= 0
    ) {
      return null;
    }
    return Math.ceil(videoDurationSeconds * pixelsPerSecond * 2);
  }, [videoDurationSeconds, pixelsPerSecond]);

  const commands = useMemo(
    () => waveformCommands(pixelsPerSecond, videoInputPath, peaksOutputPath),
    [pixelsPerSecond, videoInputPath, peaksOutputPath],
  );

  const onCopy = async (text: string) => {
    const ok = await copyText(text);
    setCopyHint(ok ? "Copied" : "Could not copy");
  };

  if (!open) return null;

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div
        ref={modalRef}
        className="help-modal waveform-peaks-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waveform-peaks-help-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="help-modal-header">
          <div className="help-head">
            <h2 id="waveform-peaks-help-title">Waveform peaks</h2>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="help-modal-body">
          <p>The timeline allows you to scrub, zoom, and edit cue times.</p>
          <p>
            You can make the experience even better by generating and importing
            audio waveform data for the audio track. Unfortunately, computing
            that data inside the browser is rather complicated and slow, so the
            web app can&apos;t do it on its own.
          </p>
          <p>
            This adds a real audio waveform so you can align subtitles to
            speech, pauses, and silence.
          </p>

          {hasRealPeaks && sourceName && (
            <p className="waveform-peaks-help-status">
              Current peaks: <code>{sourceName}</code>
            </p>
          )}

          <section
            className="waveform-peaks-help-setup"
            aria-label="Picking a suitable 'pixels per second' value"
          >
            <h3>Picking a suitable 'pixels per second' value</h3>
            <p className="hint">
              The waveform data generation command accepts a --pixels-per-second
              argument that influences the maximum zoom level in the timeline.
              This calculator here helps you find a value that should work for
              you.
            </p>
            <p className="hint">
              <strong>Note:</strong> Timeline width is CSS layout pixels (your
              window width). It is not the monitor&apos;s physical resolution —
              OS display zoom and window size both affect it.
            </p>
            <div className="waveform-peaks-help-fields">
              <label className="waveform-peaks-help-field">
                <span>Target max zoom</span>
                <div className="waveform-peaks-help-target-row">
                  <select
                    value={targetSelectValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === CUSTOM_VALUE) {
                        setTargetCustom(true);
                        setCustomTargetInput(String(safeTargetSeconds));
                        return;
                      }
                      const next = clampTargetSeconds(Number(value));
                      setTargetCustom(false);
                      setTargetSeconds(next);
                      setCustomTargetInput(String(next));
                    }}
                  >
                    {TARGET_ZOOM_PRESETS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds} s
                      </option>
                    ))}
                    <option value={CUSTOM_VALUE}>Custom…</option>
                  </select>
                  {targetSelectValue === CUSTOM_VALUE && (
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="waveform-peaks-help-target-custom"
                      value={customTargetInput}
                      aria-label="Custom max zoom (seconds)"
                      onChange={(e) => setCustomTargetInput(e.target.value)}
                      onBlur={commitCustomTarget}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitCustomTarget();
                        }
                      }}
                    />
                  )}
                </div>
              </label>
              <label className="waveform-peaks-help-field">
                <span>Timeline width</span>
                <div className="waveform-peaks-help-target-row">
                  <select
                    value={widthSelectValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === CUSTOM_VALUE) {
                        setWidthCustom(true);
                        setCustomWidthInput(String(safeWidthPx));
                        return;
                      }
                      setWidthCustom(false);
                      setWidthPx(measuredWidthPx);
                      setCustomWidthInput(String(measuredWidthPx));
                    }}
                  >
                    <option value={CURRENT_TIMELINE_WIDTH_VALUE}>
                      Current timeline ({measuredWidthPx} px)
                    </option>
                    <option value={CUSTOM_VALUE}>Custom…</option>
                  </select>
                  {widthSelectValue === CUSTOM_VALUE && (
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="waveform-peaks-help-target-custom"
                      value={customWidthInput}
                      aria-label="Custom timeline width (layout px)"
                      onChange={(e) => setCustomWidthInput(e.target.value)}
                      onBlur={commitCustomWidth}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitCustomWidth();
                        }
                      }}
                    />
                  )}
                </div>
              </label>
            </div>
            <p
              className="waveform-peaks-help-derived"
              role="status"
              aria-live="polite"
            >
              Will use{" "}
              <pre className="waveform-peaks-help-derived-pre">
                <code>--pixels-per-second {pixelsPerSecond}</code>
              </pre>
              {" · "}~{estimatedMaxZoomSeconds.toFixed(1)}&nbsp;s max zoom at
              this width
              {estimatedFileBytes !== null && (
                <>
                  {" · "}~{formatBytes(estimatedFileBytes)} .dat for this video
                </>
              )}
            </p>
          </section>

          <h3>How to generate</h3>
          <ol className="waveform-peaks-help-steps">
            <li>
              Install{" "}
              <a
                href="https://ffmpeg.org/download.html"
                target="_blank"
                rel="noreferrer"
              >
                ffmpeg
              </a>{" "}
              and{" "}
              <a
                href="https://github.com/bbc/audiowaveform"
                target="_blank"
                rel="noreferrer"
              >
                audiowaveform
              </a>{" "}
              (macOS: <code>brew install audiowaveform</code>).
            </li>
            <li>
              Extract mono 44.1&nbsp;kHz audio from the video file on your local
              filesystem and generate waveform peaks file from it:
              <div className="waveform-peaks-help-paths">
                <label className="waveform-peaks-help-field">
                  <span>Video input</span>
                  <input
                    type="text"
                    value={videoInputPath}
                    placeholder={PLACEHOLDER_VIDEO_INPUT}
                    spellCheck={false}
                    onChange={(e) => setVideoInputPath(e.target.value)}
                  />
                </label>
                <label className="waveform-peaks-help-field">
                  <span>Peaks output (.dat)</span>
                  <input
                    type="text"
                    value={peaksOutputPath}
                    placeholder={PLACEHOLDER_PEAKS_OUTPUT}
                    spellCheck={false}
                    onChange={(e) => setPeaksOutputPath(e.target.value)}
                  />
                </label>
              </div>
              {videoName?.trim() && (
                <p className="waveform-peaks-help-use-loaded">
                  <button
                    type="button"
                    className="waveform-peaks-help-use-loaded-btn"
                    onClick={() => {
                      const input = videoName.trim();
                      setVideoInputPath(input);
                      setPeaksOutputPath(peaksOutputPathForVideo(input));
                    }}
                  >
                    Use loaded video ({videoName.trim()})
                  </button>
                </p>
              )}
              <div className="waveform-peaks-help-command">
                <pre>
                  <code>{commands.twoStep}</code>
                </pre>
                <button
                  type="button"
                  className="waveform-peaks-help-copy-btn"
                  onClick={() => void onCopy(commands.twoStep)}
                >
                  Copy
                </button>
              </div>
              <p className="waveform-peaks-help-command-label">
                Or as a one-liner without a temporary WAV file:
              </p>
              <div className="waveform-peaks-help-command">
                <pre>
                  <code>{commands.oneLiner}</code>
                </pre>
                <button
                  type="button"
                  className="waveform-peaks-help-copy-btn"
                  onClick={() => void onCopy(commands.oneLiner)}
                >
                  Copy
                </button>
              </div>
            </li>
            <li>
              Import the generated <code>.dat</code> file here:
              <div className="waveform-peaks-help-import">
                <button
                  type="button"
                  className="primary"
                  disabled={!importEnabled}
                  onClick={() => {
                    onClose();
                    onImport();
                  }}
                >
                  {hasRealPeaks ? "Replace waveform…" : "Import waveform…"}
                </button>
              </div>
            </li>
          </ol>
          <aside className="waveform-peaks-help-notes" aria-label="Notes">
            <ul>
              <li>
                Imported peaks are stored with this project in your browser.
              </li>
              <li>
                To change max zoom later, update the generation settings,
                regenerate the peaks file, then choose{" "}
                <strong>Replace waveform…</strong>.
              </li>
            </ul>
          </aside>
          {copyHint && (
            <p className="waveform-peaks-help-copy-hint" role="status">
              {copyHint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
