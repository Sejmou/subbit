import { useRef, type KeyboardEvent } from "react";
import type { StoredProjectSummary } from "../lib/project-storage";
import { ProjectsTable } from "./ProjectsTable";

interface Props {
  fsSupported: boolean;
  canRestore: boolean;
  busy: string | null;
  storedProjects: StoredProjectSummary[];
  projectsLoading: boolean;
  activeProjectId?: string;
  onPickVideo: () => void;
  onVideoFile: (file: File) => void;
  onRestore: () => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (project: StoredProjectSummary) => void;
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none">
      <rect
        x="2"
        y="5"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16 10l6-3v10l-6-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LoadScreen(props: Props) {
  const videoInput = useRef<HTMLInputElement>(null);
  const fs = props.fsSupported;
  const disabled = !!props.busy;

  const pickVideo = () => {
    if (disabled) return;
    if (fs) props.onPickVideo();
    else videoInput.current?.click();
  };

  const onDropzoneKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pickVideo();
    }
  };

  return (
    <div className="load-screen">
      <div className="load-layout">
        <header className="load-header">
          <h1>Subbit</h1>
          <p className="sub">
            Subtitle editor with speaker &amp; shot metadata.
          </p>
        </header>

        <ProjectsTable
          projects={props.storedProjects}
          activeProjectId={props.activeProjectId}
          loading={props.projectsLoading}
          busy={disabled}
          onOpen={props.onOpenProject}
          onDelete={props.onDeleteProject}
        />

        <section className="load-new-section">
          <h2 className="load-section-title">New project</h2>
          <div
            className={`load-new-dropzone${disabled ? " load-new-dropzone--disabled" : ""}`}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onClick={pickVideo}
            onKeyDown={onDropzoneKeyDown}
          >
            <div className="load-new-dropzone-icon" aria-hidden>
              <VideoIcon />
            </div>
            <div className="load-new-dropzone-body">
              <p className="load-new-dropzone-title">
                {props.busy ?? "Choose a video to get started"}
              </p>
              <p className="load-new-dropzone-hint">
                MP4 works best in browsers · your files stay on your computer
              </p>
            </div>
            <span className="load-new-dropzone-cta">
              {props.busy ? "Working…" : "Browse…"}
            </span>
          </div>

          {props.canRestore && (
            <p className="load-reopen-row">
              <button
                type="button"
                className="load-reopen-btn"
                onClick={props.onRestore}
                disabled={disabled}
              >
                Reopen last session
              </button>
            </p>
          )}

          {!fs && (
            <p className="hint load-new-browser-hint">
              For autosave in place, use Chrome or Edge. Other browsers will
              download project files manually.
            </p>
          )}

          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/*"
            hidden
            onChange={(e) =>
              e.target.files?.[0] && props.onVideoFile(e.target.files[0])
            }
          />
        </section>
      </div>
    </div>
  );
}
