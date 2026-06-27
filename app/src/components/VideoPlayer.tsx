import { useEffect, useRef } from "react";
import type { Project } from "../types";
import { SubtitlePreview } from "./SubtitlePreview";
import { usePlayback } from "../store/playback";

/**
 * Plays the local video via an object URL. The browser streams the file from
 * disk, so multi-GB files work without loading into memory.
 */
export function VideoPlayer({
  src,
  project,
  previewEnabled,
}: {
  src: string;
  project: Project;
  previewEnabled: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const { setVideoEl, setTime, setDuration, setPlaying, togglePlay } =
    usePlayback();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setVideoEl(el);

    const onTime = () => setTime(el.currentTime);
    const onDuration = () => setDuration(el.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onDuration);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);

    // Smooth playhead updates while playing (timeupdate only fires ~4x/sec).
    let raf = 0;
    const tick = () => {
      if (!el.paused) {
        setTime(el.currentTime);
        raf = requestAnimationFrame(tick);
      }
    };
    const onPlaying = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    el.addEventListener("playing", onPlaying);

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onDuration);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("playing", onPlaying);
      cancelAnimationFrame(raf);
      setVideoEl(null);
    };
  }, [setVideoEl, setTime, setDuration, setPlaying]);

  return (
    <div className="video-wrap">
      <video
        ref={ref}
        src={src}
        preload="metadata"
        onClick={() => togglePlay()}
        title="Click or press Space to play / pause"
      />
      {previewEnabled && <SubtitlePreview project={project} />}
    </div>
  );
}
