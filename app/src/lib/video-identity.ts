import type { VideoIdentity } from "../types";
import { formatFrameRate, probeMp4FrameRate } from "./mp4-probe";

/** Browser-reported duration can differ slightly between loads. */
export const DURATION_TOLERANCE_S = 0.05;

/** Compare container frame rates (24000/1001 ≈ 23.976). */
export const FRAME_RATE_TOLERANCE = 0.001;

export type VideoIdentityMatch =
  { ok: true } | { ok: false; reasons: string[] };

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function hasFrameRate(
  video: VideoIdentity,
): video is VideoIdentity & {
  frameRateNumerator: number;
  frameRateDenominator: number;
} {
  return (
    video.frameRateNumerator !== undefined &&
    video.frameRateDenominator !== undefined
  );
}

function frameRatesMatch(
  a: { frameRateNumerator: number; frameRateDenominator: number },
  b: { frameRateNumerator: number; frameRateDenominator: number },
): boolean {
  const fa = a.frameRateNumerator / a.frameRateDenominator;
  const fb = b.frameRateNumerator / b.frameRateDenominator;
  return Math.abs(fa - fb) <= FRAME_RATE_TOLERANCE;
}

function durationsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= DURATION_TOLERANCE_S;
}

/** True for projects saved with the earlier sparse-hash identity format. */
export function isLegacyVideoIdentity(video: VideoIdentity): boolean {
  return (
    video.fingerprint !== undefined ||
    video.fingerprintVersion !== undefined ||
    video.fileSize !== undefined
  );
}

/**
 * Build timeline identity from the loaded movie. Whisperx JSON is not involved —
 * this runs when the user picks the video file in the browser.
 */
export async function buildVideoIdentity(
  file: File,
  duration: number,
): Promise<VideoIdentity> {
  const identity: VideoIdentity = {
    fileName: file.name,
    duration,
  };

  const frameRate = await probeMp4FrameRate(file);
  if (frameRate) {
    const g = gcd(frameRate.numerator, frameRate.denominator);
    identity.frameRateNumerator = frameRate.numerator / g;
    identity.frameRateDenominator = frameRate.denominator / g;
  }

  return identity;
}

/**
 * Compare stored vs loaded video identity.
 * Filename, file size, and legacy fingerprints are ignored.
 */
export function compareVideoIdentity(
  stored: VideoIdentity,
  current: VideoIdentity,
): VideoIdentityMatch {
  const reasons: string[] = [];

  if (!durationsMatch(stored.duration, current.duration)) {
    reasons.push(
      `duration differs (${stored.duration.toFixed(3)}s vs ${current.duration.toFixed(3)}s)`,
    );
  }

  if (hasFrameRate(stored) && hasFrameRate(current)) {
    if (!frameRatesMatch(stored, current)) {
      reasons.push(
        `frame rate differs (${formatFrameRate(stored.frameRateNumerator, stored.frameRateDenominator)} vs ${formatFrameRate(current.frameRateNumerator, current.frameRateDenominator)} fps)`,
      );
    }
  }

  return reasons.length ? { ok: false, reasons } : { ok: true };
}

export function formatVideoMismatchMessage(reasons: string[]): string {
  return `This project was authored against a different video (${reasons.join("; ")}). Subtitle timings may not match playback.`;
}
