import { useMemo, useState } from "react";
import type { Project } from "../types";
import {
  countCueAppearancesBySpeaker,
  isSpeakerReferenced,
} from "../lib/speaker-refs";
import { useProject } from "../store/project";
import { useTip } from "./Tooltip";

interface Props {
  project: Project;
  speakerFilter: string[];
  onToggleSpeakerFilter: (speakerId: string) => void;
}

/** Maps diarization labels to real character names (Rolle). */
export function SpeakerPanel({
  project,
  speakerFilter,
  onToggleSpeakerFilter,
}: Props) {
  const tip = useTip();
  const { renameSpeaker, setSpeakerColor, addSpeaker, removeSpeaker } =
    useProject();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const cueCounts = useMemo(
    () => countCueAppearancesBySpeaker(project),
    [project.cues],
  );

  const commitNewSpeaker = () => {
    const name = newName.trim();
    if (!name) return;
    addSpeaker(name);
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="speaker-panel">
      <div className="speaker-panel-header">
        <h3>Roles</h3>
        {project.speakers.length === 0 && <p className="hint">No roles yet.</p>}
      </div>
      <ul className="speaker-panel-list">
        {project.speakers.map((s, i) => {
          const referenced = isSpeakerReferenced(project, s.id);
          const displayName = s.name.trim() || "Unnamed role";
          const cueCount = cueCounts.get(s.id) ?? 0;
          const filterActive = speakerFilter.includes(s.id);
          const cueLabel = cueCount === 1 ? "cue" : "cues";
          return (
            <li key={s.id}>
              <span className="qk">{i + 1}</span>
              <input
                type="color"
                value={s.color}
                onChange={(e) => setSpeakerColor(s.id, e.target.value)}
                {...tip("Color")}
              />
              <input
                className="speaker-name"
                value={s.name}
                placeholder="Character name"
                aria-label={`Name for ${displayName}`}
                onChange={(e) => renameSpeaker(s.id, e.target.value)}
              />
              <button
                type="button"
                className={
                  filterActive
                    ? "speaker-cue-count speaker-cue-count--active"
                    : "speaker-cue-count"
                }
                aria-pressed={filterActive}
                aria-label={
                  filterActive
                    ? `Clear filter for ${displayName} (${cueCount} ${cueLabel})`
                    : `Show only cues for ${displayName} (${cueCount} ${cueLabel})`
                }
                {...tip(
                  filterActive
                    ? `Filtering: ${cueCount} ${cueLabel}. Click to clear.`
                    : `${cueCount} ${cueLabel}. Click to filter.`,
                )}
                onClick={() => onToggleSpeakerFilter(s.id)}
              >
                {cueCount}
              </button>
              <span
                className="tooltip-wrap"
                {...tip(
                  referenced
                    ? `${displayName} is assigned to cues and cannot be removed`
                    : `Remove ${displayName}`,
                )}
              >
                <button
                  type="button"
                  className="speaker-remove-btn"
                  disabled={referenced}
                  aria-label={`Remove ${displayName}`}
                  onClick={() => removeSpeaker(s.id)}
                >
                  ×
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="speaker-panel-footer">
        {adding ? (
          <input
            className="speaker-name speaker-add-input"
            value={newName}
            placeholder="Character name"
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNewSpeaker();
              if (e.key === "Escape") {
                setNewName("");
                setAdding(false);
              }
            }}
            onBlur={() => {
              if (newName.trim()) commitNewSpeaker();
              else setAdding(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="add-speaker-btn"
            onClick={() => setAdding(true)}
          >
            + Add role
          </button>
        )}
      </div>
    </div>
  );
}
