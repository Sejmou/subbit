import { useEffect, useRef, useState, type ReactNode } from "react";
import { setSetupDialogOpen } from "../lib/setup-dialog";
import { useVideoFileMetadata } from "../hooks/useVideoFileMetadata";
import { fallbackProjectName, resolveProjectName } from "../lib/project-meta";
import { useProject } from "../store/project";
import {
  SetupClankerIcon,
  SetupFolderIcon,
  SetupManualIcon,
  SetupNewProjectIcon,
} from "./SetupChoiceIcons";
import { useTip } from "./Tooltip";

interface Props {
  open: boolean;
  videoFile: File | null;
  busy: string | null;
  onImportProject: () => void;
  onImportWhisperx: (projectName: string) => void;
  onAnnotateManually: (projectName: string) => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

interface ChoiceProps {
  icon: ReactNode;
  tint: "project" | "transcript" | "manual" | "new";
  title: string;
  description: ReactNode;
  disabled: boolean;
  onClick: () => void;
}

function SetupChoice({
  icon,
  tint,
  title,
  description,
  disabled,
  onClick,
}: ChoiceProps) {
  return (
    <button
      type="button"
      className={`setup-choice setup-choice--${tint}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="setup-choice-icon">{icon}</span>
      <span className="setup-choice-body">
        <span className="setup-choice-title">{title}</span>
        <span className="setup-choice-desc">{description}</span>
      </span>
    </button>
  );
}

/** Post-video onboarding: import an existing project or set up a new one. */
export function ProjectSetupDialog({
  open,
  videoFile,
  busy,
  onImportProject,
  onImportWhisperx,
  onAnnotateManually,
}: Props) {
  const tip = useTip();
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const disabled = !!busy;
  const meta = useVideoFileMetadata(open ? videoFile : null);

  const project = useProject((s) => s.project);
  const videoName = project?.videoName ?? videoFile?.name ?? "video";

  const [step, setStep] = useState<1 | 2>(1);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setNameDraft("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSetupDialogOpen(true);
    return () => setSetupDialogOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = modalRef.current;
    if (!root) return;
    const modal: HTMLElement = root;

    function moveFocus(delta: 1 | -1) {
      const items = focusableElements(modal);
      if (items.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const index = active ? items.indexOf(active) : -1;
      const next =
        index === -1
          ? delta > 0
            ? 0
            : items.length - 1
          : (index + delta + items.length) % items.length;
      items[next]?.focus();
    }

    const id = requestAnimationFrame(() => {
      if (step === 2) {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      } else {
        focusableElements(modal)[0]?.focus();
      }
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(-1);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusableElements(modal);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && modal.contains(active);

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(e: FocusEvent) {
      if (e.target instanceof Node && modal.contains(e.target)) return;
      e.stopPropagation();
      focusableElements(modal)[0]?.focus();
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [open, step]);

  const resolvedName = () => resolveProjectName(nameDraft, videoName);

  const finishWithWhisperx = () => {
    onImportWhisperx(resolvedName());
  };

  const finishManually = () => {
    onAnnotateManually(resolvedName());
  };

  const suggestedName = fallbackProjectName(videoName);

  if (!open) return null;

  return (
    <div className="help-backdrop">
      <div
        ref={modalRef}
        className="setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={step === 2 ? "setup-step-title" : "setup-title"}
        aria-busy={!!busy}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {step === 1 ? (
          <div className="setup-modal-top">
            <h2 id="setup-title">Get started</h2>
          </div>
        ) : (
          <div className="setup-step-header">
            <button
              type="button"
              className="setup-back"
              onClick={() => setStep(1)}
              disabled={disabled}
            >
              ← Back
            </button>
            <h2 id="setup-step-title">Create new project</h2>
          </div>
        )}

        {step === 1 && meta && (
          <div className="setup-name-field setup-video-field">
            You&apos;ll be working on subtitles for:
            <div className="setup-video-card">
              <p className="setup-video-file" {...tip(meta.fileName)}>
                {meta.fileName}
              </p>
              <dl className="setup-video-meta">
                <div>
                  <dt>Size</dt>
                  <dd>{meta.fileSize}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{meta.duration ?? (meta.pending ? "…" : "—")}</dd>
                </div>
                <div>
                  <dt>Frame rate</dt>
                  <dd>{meta.frameRate ?? (meta.pending ? "…" : "—")}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {step === 1 ? (
          <div className="setup-panel">
            <div className="setup-choices">
              <SetupChoice
                tint="project"
                icon={<SetupFolderIcon />}
                title="Open a backup"
                description={
                  <>
                    Open a backup you saved earlier (<code>.subbit.zip</code>{" "}
                    from <strong>Back up project</strong>).
                  </>
                }
                disabled={disabled}
                onClick={onImportProject}
              />
              <SetupChoice
                tint="new"
                icon={<SetupNewProjectIcon />}
                title="Create a new project"
                description="Name your project and choose how to populate subtitles."
                disabled={disabled}
                onClick={() => setStep(2)}
              />
            </div>
          </div>
        ) : (
          <div className="setup-panel">
            <label className="setup-name-field" htmlFor="setup-project-name">
              Project name
              <input
                ref={nameInputRef}
                id="setup-project-name"
                className="project-name-field"
                value={nameDraft}
                placeholder={suggestedName}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className="setup-name-hint">
              Leave blank to use the video file name.
            </p>
            <div className="setup-choices">
              <SetupChoice
                tint="transcript"
                icon={<SetupClankerIcon />}
                title="Start from a whisperx audio transcript"
                description={
                  <>
                    Import whisperx <code>audio.json</code> output as your
                    starting cues.
                  </>
                }
                disabled={disabled}
                onClick={finishWithWhisperx}
              />
              <SetupChoice
                tint="manual"
                icon={<SetupManualIcon />}
                title="Annotate manually"
                description="Begin with an empty cue list and add subtitles yourself."
                disabled={disabled}
                onClick={finishManually}
              />
            </div>
          </div>
        )}

        {busy && <p className="setup-busy">{busy}</p>}
      </div>
    </div>
  );
}
