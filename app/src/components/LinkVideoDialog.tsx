import { useRef } from "react";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { storedVideoMeta } from "../lib/stored-video-meta";
import type { VideoIdentity } from "../types";
import { useTip } from "./Tooltip";

interface Props {
  open: boolean;
  fsSupported: boolean;
  projectName: string;
  videoName: string;
  video?: VideoIdentity;
  busy: string | null;
  onVideoFile: (file: File) => void;
  onPickVideo: () => void;
  onCancel: () => void;
}

/** Ask the user to re-link a video file before opening a stored project. */
export function LinkVideoDialog({
  open,
  fsSupported,
  projectName,
  videoName,
  video,
  busy,
  onVideoFile,
  onPickVideo,
  onCancel,
}: Props) {
  const tip = useTip();
  const videoInput = useRef<HTMLInputElement>(null);
  const modalRef = useModalFocusTrap(open, onCancel);
  const disabled = !!busy;
  const meta = storedVideoMeta(videoName, video);

  const chooseVideo = () => {
    if (disabled) return;
    if (fsSupported) onPickVideo();
    else videoInput.current?.click();
  };

  if (!open) return null;

  return (
    <div className="help-backdrop" onMouseDown={onCancel}>
      <div
        ref={modalRef}
        className="setup-modal link-video-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-video-title"
        aria-busy={disabled}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="setup-modal-top">
          <h2 id="link-video-title">Choose video to open project</h2>
        </div>

        <p className="link-video-lead">
          <strong>{projectName}</strong> needs its source video before you can
          edit. Choose the matching file below — timings are verified by
          duration and frame rate, not the filename.
        </p>

        <div className="setup-name-field setup-video-field">
          Expected video
          <div className="setup-video-card">
            <p className="setup-video-file" {...tip(meta.fileName)}>
              {meta.fileName}
            </p>
            <dl className="setup-video-meta">
              <div>
                <dt>Size</dt>
                <dd>{meta.fileSize ?? "—"}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{meta.duration ?? "—"}</dd>
              </div>
              <div>
                <dt>Frame rate</dt>
                <dd>{meta.frameRate ?? "—"}</dd>
              </div>
            </dl>
          </div>
        </div>

        <p className="link-video-format-hint">
          Video file · MP4 works best · .mp4, .m4v, or .mov
        </p>

        {!fsSupported && (
          <p className="link-video-browser-hint">
            This browser can&apos;t remember file access between sessions, so
            you&apos;ll need to choose the video each time you open a project.
          </p>
        )}

        {busy && <p className="setup-busy">{busy}</p>}

        <div className="confirm-actions link-video-actions">
          <button type="button" onClick={onCancel} disabled={disabled}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={chooseVideo}
            disabled={disabled}
          >
            {busy ? "Working…" : "Choose video file…"}
          </button>
        </div>

        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.m4v,.mov,video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onVideoFile(file);
          }}
        />
      </div>
    </div>
  );
}
