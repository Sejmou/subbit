import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: () => void;
}

/** Explains timeline-only mode and how to import waveform peaks. */
export function WaveformPeaksHelpDialog({ open, onClose, onImport }: Props) {
  const modalRef = useModalFocusTrap(open, onClose);

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
        <div className="help-head">
          <h2 id="waveform-peaks-help-title">Waveform peaks</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <p>The timeline allows you to scrub, zoom, and edit cue times.</p>
        <p>
          You can make the experience even better by generating and importing
          audio waveform data for the audio track (unfortunately, computing that
          data inside the browser is rather complicated and slow, so the web app
          can't do it on its own).
        </p>
        <p>
          This adds a real audio waveform so you can align subtitles to speech,
          pauses, and silence.
        </p>
        <h3>How to import</h3>
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
            Extract mono 44.1&nbsp;kHz audio, then generate peaks (with
            80&nbsp;px/s - recommended so that max. zoom is granular enough):
            <pre>
              <code>{`ffmpeg -i your-video.mp4 -vn -ac 1 -ar 44100 your-video.wav
audiowaveform -i your-video.wav -o your-video.dat -b 8 --pixels-per-second 80`}</code>
            </pre>
            Or as a one-liner without a temporary WAV file:
            <pre>
              <code>{`ffmpeg -i your-video.mp4 -vn -ac 1 -ar 44100 -f wav - \\
  | audiowaveform -i - -o your-video.dat -b 8 --pixels-per-second 80`}</code>
            </pre>
            Replace <code>your-video.mp4</code> and <code>your-video.dat</code>{" "}
            with your paths.
          </li>
          <li>
            Import the generated <code>.dat</code> file here:
            <div className="waveform-peaks-help-import">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onClose();
                  onImport();
                }}
              >
                Import waveform…
              </button>
            </div>
          </li>
        </ol>
        <p className="hint">
          Peaks are saved with your project after import. For finer zoom detail,
          regenerate with a higher <code>--pixels-per-second</code> value (e.g.{" "}
          <code>100</code>), then import again.
        </p>
      </div>
    </div>
  );
}
