import { useEffect, useState } from "react";
import type { Project } from "../types";
import { useProject } from "../store/project";
import { shortcutLabel } from "../lib/shortcuts";
import { formatRelativeTime } from "../lib/relative-time";
import { FileMenu } from "./FileMenu";
import { ProjectNameField } from "./ProjectNameField";
import { FiltersMenu } from "./FiltersMenu";
import type { ReviewStatusFilter } from "../lib/cue-filters";

type SaveStateVariant = "saving" | "edited" | "unsaved" | "saved";

interface Props {
  project: Project;
  dirty: boolean;
  lastSavedAt: number | null;
  autosaveEnabled: boolean;
  saving: boolean;
  onSave: () => void;
  onExport: () => void;
  onHelp: () => void;
  onHistory: () => void;
  onImportProjectBundle: () => void;
  onExportProjectBundle: () => void;
  onNewBlankProject: () => void;
  onImportWhisperx: () => void;
  onImportWaveform: () => void;
  onCloseProject: () => void;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  speakerFilter: string[];
  statusFilter: ReviewStatusFilter[];
  onToggleSpeakerFilter: (speakerId: string) => void;
  onToggleStatusFilter: (status: ReviewStatusFilter) => void;
  onClearFilters: () => void;
}

function saveStateLabel(
  saving: boolean,
  dirty: boolean,
  lastSavedAt: number | null,
  autosaveEnabled: boolean,
): { label: string; title?: string; variant: SaveStateVariant | null } {
  if (saving) return { label: "Saving…", variant: "saving" };
  if (dirty) {
    if (autosaveEnabled) {
      return {
        label: "Edited",
        title: "Autosaves in a few seconds",
        variant: "edited",
      };
    }
    return { label: "Unsaved changes", variant: "unsaved" };
  }
  if (lastSavedAt) {
    return {
      label: `Last save ${formatRelativeTime(lastSavedAt)}`,
      variant: "saved",
    };
  }
  return { label: "", variant: null };
}

function ReviewProgress({
  reviewed,
  total,
}: {
  reviewed: number;
  total: number;
}) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? reviewed / total : 0;
  const dashOffset = circumference * (1 - ratio);
  const percent = (ratio * 100).toFixed(1);
  const summary = `${reviewed} of ${total} cues reviewed (${percent}%)`;

  return (
    <span className="review-progress" title={summary} aria-label={summary}>
      <svg className="review-progress-ring" viewBox="0 0 22 22" aria-hidden>
        <circle className="review-progress-track" cx="11" cy="11" r={radius} />
        <circle
          className="review-progress-fill"
          cx="11"
          cy="11"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="review-progress-label">
        {reviewed}/{total} reviewed
      </span>
    </span>
  );
}

export function Toolbar({
  project,
  dirty,
  lastSavedAt,
  autosaveEnabled,
  saving,
  onSave,
  onExport,
  onHelp,
  onHistory,
  onImportProjectBundle,
  onExportProjectBundle,
  onNewBlankProject,
  onImportWhisperx,
  onImportWaveform,
  onCloseProject,
  previewEnabled,
  onTogglePreview,
  speakerFilter,
  statusFilter,
  onToggleSpeakerFilter,
  onToggleStatusFilter,
  onClearFilters,
}: Props) {
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const setProjectName = useProject((s) => s.setProjectName);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const reviewed = project.cues.filter((c) => c.reviewed).length;
  const total = project.cues.length;

  // Re-render periodically so "Last save … ago" stays fresh.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  const saveState = saveStateLabel(saving, dirty, lastSavedAt, autosaveEnabled);

  return (
    <div className="toolbar">
      <strong className="brand">Subbit</strong>
      <FileMenu
        onImportProjectBundle={onImportProjectBundle}
        onExportProjectBundle={onExportProjectBundle}
        onNewBlankProject={onNewBlankProject}
        onImportWhisperx={onImportWhisperx}
        onImportWaveform={onImportWaveform}
        onCloseProject={onCloseProject}
      />
      <ProjectNameField
        name={project.name}
        videoName={project.videoName}
        onCommit={setProjectName}
      />
      <FiltersMenu
        project={project}
        speakerFilter={speakerFilter}
        statusFilter={statusFilter}
        onToggleSpeakerFilter={onToggleSpeakerFilter}
        onToggleStatusFilter={onToggleStatusFilter}
        onClearFilters={onClearFilters}
      />
      <ReviewProgress reviewed={reviewed} total={total} />

      <span className="btn-group">
        <button
          onClick={undo}
          disabled={!canUndo}
          title={`Undo (${shortcutLabel("undo")})`}
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={`Redo (${shortcutLabel("redo")})`}
        >
          Redo
        </button>
      </span>

      <span className="spacer" />

      <span className="toolbar-actions">
        <span
          className={
            saveState.variant
              ? `save-state save-state--${saveState.variant}`
              : "save-state"
          }
          title={saveState.title}
        >
          {saveState.label}
        </span>
        <button
          className={
            previewEnabled ? "preview-btn preview-btn--on" : "preview-btn"
          }
          onClick={onTogglePreview}
          title={`${previewEnabled ? "Hide" : "Show"} subtitle preview on video (${shortcutLabel("preview-toggle")})`}
        >
          Preview
        </button>
        <button onClick={onHistory} title="Version history">
          History
        </button>
        <button
          className={dirty ? "primary save-btn" : "save-btn"}
          onClick={onSave}
          disabled={saving}
          title={`Save project (${shortcutLabel("save")})`}
        >
          Save
        </button>
        <button onClick={onExport}>Export…</button>
        <button
          className="help-btn"
          onClick={onHelp}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
        >
          ?
        </button>
      </span>
    </div>
  );
}
