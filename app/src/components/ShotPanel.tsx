import { useMemo, useState } from "react";
import type { Project } from "../types";
import {
  countCueAppearancesByShotWithFilters,
  type ReviewStatusFilter,
} from "../lib/cue-filters";
import { isShotReferenced } from "../lib/shot-refs";
import { isDefaultShotId } from "../lib/delivery-shot";
import { shotDisplayLabel } from "../lib/shot-display";
import { useProject } from "../store/project";
import { useTip } from "./Tooltip";

interface Props {
  project: Project;
  speakerFilter: string[];
  statusFilter: ReviewStatusFilter[];
  shotFilter: string[];
  onToggleShotFilter: (shotId: string) => void;
}

/** Project shot types (Info column tokens) with labels and custom entries. */
export function ShotPanel({
  project,
  speakerFilter,
  statusFilter,
  shotFilter,
  onToggleShotFilter,
}: Props) {
  const tip = useTip();
  const { addShot, renameShotLabel, removeShot } = useProject();
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const cueCounts = useMemo(
    () =>
      countCueAppearancesByShotWithFilters(
        project,
        speakerFilter,
        statusFilter,
      ),
    [project.cues, speakerFilter, statusFilter],
  );

  const commitNewShot = () => {
    const id = newId.trim();
    const label = newLabel.trim() || id;
    if (!id) return;
    if (!addShot(id, label)) return;
    setNewId("");
    setNewLabel("");
    setAdding(false);
  };

  return (
    <div className="shot-panel">
      <div className="shot-panel-header">
        <h3>Shot types</h3>
        <p className="hint">
          Info column tokens for on/off camera and custom labels.
        </p>
      </div>
      <ul className="shot-panel-list">
        {project.shots.map((shot, i) => {
          const referenced = isShotReferenced(project, shot.id);
          const isDefault = isDefaultShotId(shot.id);
          const cueCount = cueCounts.get(shot.id) ?? 0;
          const cueLabel = cueCount === 1 ? "cue" : "cues";
          const filterActive = shotFilter.includes(shot.id);
          const displayLabel = shotDisplayLabel(shot.id, shot.label);
          return (
            <li key={shot.id}>
              <span className="qk">{i + 1}</span>
              <code className="shot-id" title="Export token">
                {shot.id}
              </code>
              <input
                className="shot-label"
                value={shot.label}
                placeholder="Display label"
                aria-label={`Label for shot ${shot.id}`}
                onChange={(e) => renameShotLabel(shot.id, e.target.value)}
              />
              <span
                className="tooltip-wrap"
                {...tip(
                  filterActive
                    ? `Clear filter for ${displayLabel} (${cueCount} ${cueLabel})`
                    : `${cueCount} ${cueLabel}. Click to filter.`,
                )}
              >
                <button
                  type="button"
                  className={
                    filterActive
                      ? "shot-cue-count shot-cue-count--active"
                      : "shot-cue-count"
                  }
                  aria-pressed={filterActive}
                  aria-label={
                    filterActive
                      ? `Clear filter for ${displayLabel} (${cueCount} ${cueLabel})`
                      : `Show only cues for ${displayLabel} (${cueCount} ${cueLabel})`
                  }
                  onClick={() => onToggleShotFilter(shot.id)}
                >
                  {cueCount}
                </button>
              </span>
              <span
                className="tooltip-wrap"
                {...tip(
                  isDefault
                    ? `${displayLabel} is a built-in shot type`
                    : referenced
                      ? `${displayLabel} is assigned to cues and cannot be removed`
                      : `Remove ${displayLabel}`,
                )}
              >
                <button
                  type="button"
                  className="shot-remove-btn"
                  disabled={isDefault || referenced}
                  aria-label={`Remove ${displayLabel}`}
                  onClick={() => removeShot(shot.id)}
                >
                  ×
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="shot-panel-footer">
        {adding ? (
          <div className="shot-add-fields">
            <input
              className="shot-label shot-add-id"
              value={newId}
              placeholder="ID (export token)"
              autoFocus
              onChange={(e) => setNewId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNewShot();
                if (e.key === "Escape") {
                  setNewId("");
                  setNewLabel("");
                  setAdding(false);
                }
              }}
            />
            <input
              className="shot-label shot-add-label"
              value={newLabel}
              placeholder="Label (optional)"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNewShot();
                if (e.key === "Escape") {
                  setNewId("");
                  setNewLabel("");
                  setAdding(false);
                }
              }}
            />
            <button
              type="button"
              className="shot-add-commit"
              onClick={commitNewShot}
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="add-shot-btn"
            onClick={() => setAdding(true)}
          >
            + Add shot type
          </button>
        )}
      </div>
    </div>
  );
}
