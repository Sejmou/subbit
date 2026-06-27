import { describe, expect, it } from "vitest";
import { formatFileSize, formatMediaDuration } from "./video-meta-format";

describe("video-meta-format", () => {
  it("formats file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatFileSize(1.2 * 1024 * 1024 * 1024)).toBe("1.20 GB");
  });

  it("formats media duration", () => {
    expect(formatMediaDuration(65)).toBe("1:05");
    expect(formatMediaDuration(3665)).toBe("1:01:05");
    expect(formatMediaDuration(0)).toBe("0:00");
  });
});
