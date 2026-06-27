import { useEffect, useState } from "react";
import { formatFrameRate, probeMp4FrameRate } from "../lib/mp4-probe";
import { formatFileSize, formatMediaDuration } from "../lib/video-meta-format";
import { usePlayback } from "../store/playback";

export interface VideoFileMetadata {
  fileName: string;
  fileSize: string;
  duration: string | null;
  frameRate: string | null;
  /** Duration or frame rate still loading. */
  pending: boolean;
}

export function useVideoFileMetadata(
  videoFile: File | null,
): VideoFileMetadata | null {
  const playbackDuration = usePlayback((s) => s.duration);
  const [frameRate, setFrameRate] = useState<string | null>(null);
  const [probingFps, setProbingFps] = useState(false);

  useEffect(() => {
    if (!videoFile) {
      setFrameRate(null);
      setProbingFps(false);
      return;
    }

    let cancelled = false;
    setProbingFps(true);
    void probeMp4FrameRate(videoFile)
      .then((rate) => {
        if (cancelled) return;
        setFrameRate(
          rate
            ? `${formatFrameRate(rate.numerator, rate.denominator)} fps`
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setFrameRate(null);
      })
      .finally(() => {
        if (!cancelled) setProbingFps(false);
      });

    return () => {
      cancelled = true;
    };
  }, [videoFile]);

  if (!videoFile) return null;

  const duration =
    Number.isFinite(playbackDuration) && playbackDuration > 0
      ? formatMediaDuration(playbackDuration)
      : null;

  return {
    fileName: videoFile.name,
    fileSize: formatFileSize(videoFile.size),
    duration,
    frameRate,
    pending:
      probingFps || !Number.isFinite(playbackDuration) || playbackDuration <= 0,
  };
}
