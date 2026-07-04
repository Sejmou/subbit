import { useEffect, useRef, useState } from "react";
import type { Project } from "../types";
import {
  activeFilterCount,
  hasActiveFilters,
  REVIEW_STATUS_OPTIONS,
  type ReviewStatusFilter,
} from "../lib/cue-filters";
import { shotDisplayLabel } from "../lib/shot-display";
import { useTip } from "./Tooltip";

interface Props {
  project: Project;
  speakerFilter: string[];
  statusFilter: ReviewStatusFilter[];
  shotFilter: string[];
  onToggleSpeakerFilter: (speakerId: string) => void;
  onToggleStatusFilter: (status: ReviewStatusFilter) => void;
  onToggleShotFilter: (shotId: string) => void;
  onClearFilters: () => void;
}

export function FiltersMenu({
  project,
  speakerFilter,
  statusFilter,
  shotFilter,
  onToggleSpeakerFilter,
  onToggleStatusFilter,
  onToggleShotFilter,
  onClearFilters,
}: Props) {
  const tip = useTip();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterActive = hasActiveFilters(
    speakerFilter,
    statusFilter,
    shotFilter,
  );
  const filterCount = activeFilterCount(
    speakerFilter,
    statusFilter,
    shotFilter,
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="filters-menu-group">
      <div className="toolbar-dropdown filters-menu" ref={rootRef}>
        <button
          type="button"
          className={
            filterActive
              ? "toolbar-dropdown-trigger filters-menu-trigger--active"
              : "toolbar-dropdown-trigger"
          }
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
        >
          Filters{filterActive ? ` (${filterCount})` : ""} ▾
        </button>
        {open && (
          <div
            className="toolbar-dropdown-panel filters-menu-panel"
            role="menu"
          >
            <div className="filters-menu-heading">Status</div>
            {REVIEW_STATUS_OPTIONS.map(({ id, label }) => (
              <label
                key={id}
                className="filters-menu-item"
                role="menuitemcheckbox"
              >
                <input
                  type="checkbox"
                  checked={statusFilter.includes(id)}
                  onChange={() => onToggleStatusFilter(id)}
                />
                <span className="filters-menu-label">{label}</span>
              </label>
            ))}

            <hr />

            <div className="filters-menu-heading">Roles</div>
            {project.speakers.length === 0 ? (
              <p className="filters-menu-empty">No roles defined yet.</p>
            ) : (
              project.speakers.map((s) => {
                const displayName = s.name.trim() || "Unnamed role";
                const checked = speakerFilter.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className="filters-menu-item"
                    role="menuitemcheckbox"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSpeakerFilter(s.id)}
                    />
                    <span
                      className="filters-menu-swatch"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <span className="filters-menu-label">{displayName}</span>
                  </label>
                );
              })
            )}

            <hr />

            <div className="filters-menu-heading">Shot types</div>
            {project.shots.length === 0 ? (
              <p className="filters-menu-empty">No shot types defined yet.</p>
            ) : (
              project.shots.map((shot) => {
                const displayName = shotDisplayLabel(shot.id, shot.label);
                const checked = shotFilter.includes(shot.id);
                return (
                  <label
                    key={shot.id}
                    className="filters-menu-item"
                    role="menuitemcheckbox"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleShotFilter(shot.id)}
                    />
                    <span className="filters-menu-label">{displayName}</span>
                  </label>
                );
              })
            )}
            {filterActive && (
              <>
                <hr />
                <button
                  type="button"
                  className="filters-menu-clear"
                  onClick={onClearFilters}
                >
                  Reset filters
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {filterActive && (
        <button
          type="button"
          className="filters-reset-btn"
          onClick={onClearFilters}
          {...tip("Reset filters")}
        >
          Reset
        </button>
      )}
    </div>
  );
}
