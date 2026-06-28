import { useEffect, useRef, useState } from "react";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import {
  buildVideoIdentity,
  compareVideoIdentity,
  formatVideoMismatchMessage,
  isLegacyVideoIdentity,
} from "../lib/video-identity";

export type VideoIdentityStatus =
  "idle" | "checking" | "ok" | "mismatch" | "missing";

function durationsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.05;
}

/**
 * When a video file and project are both loaded, read duration + container frame
 * rate and compare to the stored identity. Whisperx JSON is not involved.
 */
export function useVideoIdentity(videoFile: File | null) {
  const hasProject = useProject((s) => s.project !== null);
  const storedVideo = useProject((s) => s.project?.video);
  const duration = usePlayback((s) => s.duration);
  const setVideoIdentity = useProject((s) => s.setVideoIdentity);

  const [status, setStatus] = useState<VideoIdentityStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const lastCheckedKey = useRef("");

  useEffect(() => {
    lastCheckedKey.current = "";
  }, [
    storedVideo?.duration,
    storedVideo?.frameRateNumerator,
    storedVideo?.frameRateDenominator,
  ]);

  useEffect(() => {
    if (!hasProject) {
      setStatus("idle");
      setMessage(null);
      lastCheckedKey.current = "";
      return;
    }

    if (!videoFile) {
      setStatus(storedVideo ? "missing" : "idle");
      setMessage(
        storedVideo
          ? "No video loaded. Subtitle timings cannot be verified against the saved video identity."
          : null,
      );
      return;
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      setStatus("idle");
      setMessage(null);
      return;
    }

    const checkKey = [
      duration,
      storedVideo?.duration ?? "",
      storedVideo?.frameRateNumerator ?? "",
      storedVideo?.frameRateDenominator ?? "",
    ].join(":");
    if (checkKey === lastCheckedKey.current) return;

    let cancelled = false;
    setStatus("checking");
    setMessage(null);

    void (async () => {
      try {
        const current = await buildVideoIdentity(videoFile, duration);
        if (cancelled) return;

        if (!storedVideo) {
          setVideoIdentity({ ...current, fileName: videoFile.name });
          lastCheckedKey.current = checkKey;
          setStatus("ok");
          setMessage(null);
          return;
        }

        const match = compareVideoIdentity(storedVideo, current);
        if (
          !match.ok &&
          isLegacyVideoIdentity(storedVideo) &&
          durationsMatch(storedVideo.duration, current.duration)
        ) {
          setVideoIdentity({ ...current, fileName: videoFile.name });
          lastCheckedKey.current = checkKey;
          setStatus("ok");
          setMessage(null);
          return;
        }

        lastCheckedKey.current = checkKey;
        if (match.ok) {
          if (
            storedVideo.fileSize === undefined &&
            current.fileSize !== undefined
          ) {
            setVideoIdentity({
              ...storedVideo,
              fileSize: current.fileSize,
              fileName: videoFile.name,
            });
          }
          setStatus("ok");
          setMessage(null);
          return;
        }

        setStatus("mismatch");
        setMessage(formatVideoMismatchMessage(match.reasons));
      } catch (err) {
        if (cancelled) return;
        console.error("Video identity check failed", err);
        setStatus("idle");
        setMessage(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoFile, hasProject, storedVideo, duration, setVideoIdentity]);

  return { status, message };
}
