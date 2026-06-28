import { useRef } from "react";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { storedVideoMeta } from "../lib/stored-video-meta";
import type { VideoIdentity } from "../types";

interface Props {
  open: boolean;
  projectName: string;
  videoName: string;
  video?: VideoIdentity;
  busy: string | null;
  onVideoFile: (file: File) => void;
  onCancel: () => void;
}

/** Ask the user to re-link a video file when the browser cannot restore handles. */
export function LinkVideoDialog({
  open,
  projectName,
  videoName,
  video,
  busy,
  onVideoFile,
  onCancel,
}: Props) {
  const videoInput = useRef<HTMLInputElement>(null);
  const modalRef = useModalFocusTrap(open, onCancel);
  const disabled = !!busy;
  const meta = storedVideoMeta(videoName, video);

  const chooseVideo = () => {
    if (disabled) return;
    videoInput.current?.click();
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
          <h2 id="link-video-title">Link video to open project</h2>
        </div>

        <p className="link-video-lead">
          This browser can&apos;t reopen the video automatically. Choose the
          matching file for <strong>{projectName}</strong>.
        </p>

        <div className="setup-name-field setup-video-field">
          Expected video
          <div className="setup-video-card">
            <p className="setup-video-file" title={meta.fileName}>
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
          accept="video/mp4,video/*"
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
