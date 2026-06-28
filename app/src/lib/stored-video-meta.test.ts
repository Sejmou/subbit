import { describe, expect, it } from "vitest";
import { storedVideoMeta } from "./stored-video-meta";

describe("storedVideoMeta", () => {
  it("prefers the stored video identity filename", () => {
    expect(
      storedVideoMeta("clip.mp4", {
        fileName: "episode-01.mp4",
        duration: 125,
        frameRateNumerator: 24000,
        frameRateDenominator: 1001,
      }),
    ).toMatchObject({
      fileName: "episode-01.mp4",
      duration: "2:05",
      frameRate: "23.976 fps",
    });
  });

  it("falls back to the project video name", () => {
    expect(storedVideoMeta("clip.mp4", { duration: 90 })).toMatchObject({
      fileName: "clip.mp4",
      duration: "1:30",
      frameRate: null,
      fileSize: null,
    });
  });

  it("formats legacy file size when present", () => {
    expect(
      storedVideoMeta("clip.mp4", {
        duration: 10,
        fileSize: 1024 * 1024 * 512,
      }).fileSize,
    ).toBe("512.0 MB");
  });
});
