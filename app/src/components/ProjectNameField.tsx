import { useEffect, useRef, useState } from "react";
import { fallbackProjectName, resolveProjectName } from "../lib/project-meta";

interface Props {
  name: string;
  videoName: string;
  onCommit: (name: string) => void;
}

/** Click the title to rename; commits on blur/Enter, Escape cancels. */
export function ProjectNameField({ name, videoName, onCommit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  const commit = () => {
    const next = resolveProjectName(draft, videoName);
    setDraft(next);
    setEditing(false);
    if (next !== name) onCommit(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="project-name-edit"
        value={draft}
        placeholder={fallbackProjectName(videoName)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label="Project name"
      />
    );
  }

  return (
    <button
      type="button"
      className="project-name-display"
      onClick={() => setEditing(true)}
      title="Click to rename project"
    >
      {name}
    </button>
  );
}
