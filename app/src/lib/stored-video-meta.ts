import { formatFrameRate } from "./mp4-probe";
import { formatFileSize, formatMediaDuration } from "./video-meta-format";
import type { VideoIdentity } from "../types";

export interface StoredVideoMeta {
  fileName: string;
  fileSize: string | null;
  duration: string | null;
  frameRate: string | null;
}

/** Display metadata for a project’s linked video when the file isn’t open. */
export function storedVideoMeta(
  videoName: string,
  video?: VideoIdentity,
): StoredVideoMeta {
  const fileName = video?.fileName?.trim() || videoName;

  const duration =
    video?.duration != null && Number.isFinite(video.duration)
      ? formatMediaDuration(video.duration)
      : null;

  let frameRate: string | null = null;
  if (
    video?.frameRateNumerator != null &&
    video?.frameRateDenominator != null &&
    video.frameRateDenominator > 0
  ) {
    frameRate = `${formatFrameRate(video.frameRateNumerator, video.frameRateDenominator)} fps`;
  }

  const fileSize =
    video?.fileSize != null && video.fileSize > 0
      ? formatFileSize(video.fileSize)
      : null;

  return { fileName, fileSize, duration, frameRate };
}
