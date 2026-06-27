import { useMemo } from "react";
import type { Project } from "../types";
import { previewAtTime } from "../lib/preview-subtitle";
import { usePlayback } from "../store/playback";

export function SubtitlePreview({ project }: { project: Project }) {
  const currentTime = usePlayback((s) => s.currentTime);
  const preview = useMemo(
    () => previewAtTime(project, currentTime),
    [project, currentTime],
  );

  if (!preview) return null;

  return (
    <div className="subtitle-preview" aria-live="polite">
      <p className="subtitle-preview-text">{preview.text}</p>
    </div>
  );
}
