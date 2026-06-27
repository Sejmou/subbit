import { useRef } from "react";

interface Props {
  fsSupported: boolean;
  canRestore: boolean;
  busy: string | null;
  onPickVideo: () => void;
  onVideoFile: (file: File) => void;
  onRestore: () => void;
}

export function LoadScreen(props: Props) {
  const videoInput = useRef<HTMLInputElement>(null);
  const fs = props.fsSupported;

  return (
    <div className="load-screen">
      <div className="load-card">
        <h1>Subbit</h1>
        <p className="sub">Subtitle editor with speaker &amp; shot metadata.</p>

        {props.canRestore && (
          <button
            className="primary wide"
            onClick={props.onRestore}
            disabled={!!props.busy}
          >
            Reopen last session
          </button>
        )}

        <div className="load-video-step">
          <p className="load-video-lead">Choose a video to get started.</p>
          <button
            className="primary wide"
            onClick={fs ? props.onPickVideo : () => videoInput.current?.click()}
            disabled={!!props.busy}
          >
            {props.busy ?? "Choose video…"}
          </button>
          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/*"
            hidden
            onChange={(e) =>
              e.target.files?.[0] && props.onVideoFile(e.target.files[0])
            }
          />
        </div>
        {!fs && (
          <p className="hint">
            Your browser can't save files in place. Use Chrome or Edge for the
            best experience; otherwise you'll download the project/exports
            manually.
          </p>
        )}
      </div>
    </div>
  );
}
