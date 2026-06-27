import { useEffect, useRef, useState } from "react";
import { fallbackProjectName, resolveProjectName } from "../lib/project-meta";

interface Props {
  fsSupported: boolean;
  videoFileName: string | null;
  loadedProjectName: string | null;
  hasSubtitles: boolean;
  canRestore: boolean;
  busy: string | null;
  onPickVideo: () => void;
  onPickSubtitles: () => void;
  onVideoFile: (file: File) => void;
  onSubtitlesFile: (file: File) => void;
  onRestore: () => void;
  onStart: (projectName: string) => void;
}

export function LoadScreen(props: Props) {
  const videoInput = useRef<HTMLInputElement>(null);
  const subtitlesInput = useRef<HTMLInputElement>(null);
  const fs = props.fsSupported;
  const [projectName, setProjectName] = useState("");
  const suggestedName = props.videoFileName
    ? fallbackProjectName(props.videoFileName)
    : "Untitled";

  useEffect(() => {
    setProjectName(props.loadedProjectName ?? "");
  }, [props.loadedProjectName, props.videoFileName]);

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

        <ol className="steps">
          <li>
            <span>1. Video</span>
            <button
              onClick={
                fs ? props.onPickVideo : () => videoInput.current?.click()
              }
              disabled={!!props.busy}
            >
              {props.videoFileName ?? "Choose video…"}
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
          </li>

          <li>
            <span>2. Subtitles (optional)</span>
            <button
              onClick={
                fs
                  ? props.onPickSubtitles
                  : () => subtitlesInput.current?.click()
              }
              disabled={!!props.busy}
            >
              Choose whisperx JSON or project
            </button>
            <input
              ref={subtitlesInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) =>
                e.target.files?.[0] && props.onSubtitlesFile(e.target.files[0])
              }
            />
            <span className="step-note">
              {props.hasSubtitles ? (
                <span className="ok">loaded</span>
              ) : (
                "Optional — import whisperx or a saved project, or start with a blank project."
              )}
            </span>
          </li>
        </ol>

        <div className="load-project-name">
          <label htmlFor="load-project-name">Project name</label>
          <input
            id="load-project-name"
            className="project-name-field"
            placeholder={suggestedName}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            disabled={!!props.busy || !props.videoFileName}
          />
          <p className="step-note">
            {props.videoFileName
              ? `Leave blank to use “${suggestedName}”.`
              : "Choose a video first."}
          </p>
        </div>

        <button
          className="primary wide"
          disabled={!props.videoFileName || !!props.busy}
          onClick={() =>
            props.onStart(
              resolveProjectName(projectName, props.videoFileName ?? "video"),
            )
          }
        >
          {props.busy ?? "Start editing"}
        </button>

        <p className="hint">Press ? anytime for keyboard shortcuts.</p>

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
