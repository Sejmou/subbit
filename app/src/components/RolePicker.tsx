import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../types";
import { useProject } from "../store/project";
import {
  filterRoleOptions,
  setRolePickerOpen,
  type RoleOption,
} from "../lib/role-picker";
import { useShortcutLabel } from "../hooks/useShortcutLabel";

interface Props {
  open: boolean;
  cueId: string | null;
  project: Project;
  onClose: () => void;
}

export function RolePicker({ open, cueId, project, onClose }: Props) {
  const setCueSpeaker = useProject((s) => s.setCueSpeaker);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const assignRoleLabel = useShortcutLabel("assign-role");

  const options = useMemo(
    () => filterRoleOptions(project.speakers, query),
    [project.speakers, query],
  );
  const cue = cueId ? project.cues.find((c) => c.id === cueId) : undefined;
  const currentSpeakerId = cue?.speakerId ?? null;

  useEffect(() => {
    setRolePickerOpen(open);
    return () => setRolePickerOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, cueId]);

  useEffect(() => {
    setHighlight((i) =>
      options.length === 0 ? 0 : Math.min(i, options.length - 1),
    );
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open, options]);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (options.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setHighlight((i) => (i + 1) % options.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setHighlight((i) => (i - 1 + options.length) % options.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const option = options[highlight];
        if (option && cueId) {
          setCueSpeaker(cueId, option.id);
          onClose();
        }
      }
    }

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, options, highlight, onClose, cueId, setCueSpeaker]);

  if (!open || !cueId || !cue) return null;

  function pick(option: RoleOption) {
    setCueSpeaker(cueId!, option.id);
    onClose();
  }

  return (
    <div className="role-picker-backdrop" onMouseDown={onClose}>
      <div
        className="role-picker"
        role="dialog"
        aria-label="Assign role"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <label className="role-picker-label" htmlFor="role-picker-search">
          Assign role
        </label>
        <input
          id="role-picker-search"
          ref={inputRef}
          className="role-picker-search"
          type="search"
          placeholder="Search roles…"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
        />
        <div className="role-picker-list" ref={listRef} role="listbox">
          {options.length === 0 ? (
            <p className="role-picker-empty">No matching roles</p>
          ) : (
            options.map((option, index) => {
              const selected = option.id === currentSpeakerId;
              const active = index === highlight;
              return (
                <button
                  key={option.id ?? "__none__"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={[
                    "role-picker-option",
                    active && "role-picker-option--active",
                    selected && "role-picker-option--selected",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(option)}
                >
                  {option.color && (
                    <span
                      className="role-picker-swatch"
                      style={{ background: option.color }}
                      aria-hidden
                    />
                  )}
                  <span className="role-picker-option-label">
                    {option.name}
                  </span>
                  {selected && (
                    <span className="role-picker-current">Current</span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <p className="role-picker-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> assign ·{" "}
          <kbd>Esc</kbd> close · <kbd>{assignRoleLabel || "A"}</kbd> opens this
          picker
        </p>
      </div>
    </div>
  );
}
