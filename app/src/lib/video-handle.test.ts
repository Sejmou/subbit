import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../types";
import {
  canRestoreLastSession,
  formatVideoFilenameMismatch,
  resolveVideoForProject,
  videoFilenameDiffers,
} from "./video-handle";
import * as projectIo from "./project-io";

vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

const project: Project = {
  version: 1,
  id: "proj-1",
  name: "Show",
  videoName: "episode.mp4",
  fps: 25,
  timecodeOffset: "10:00:00:00",
  defaultShot: "ON",
  shots: [{ id: "ON", label: "On-screen" }],
  speakers: [],
  cues: [],
};

function mockHandle(name = "episode.mp4"): projectIo.FsFileHandle {
  return {
    name,
    kind: "file",
    getFile: vi
      .fn()
      .mockResolvedValue(new File([], name, { type: "video/mp4" })),
    createWritable: vi.fn(),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("videoFilenameDiffers", () => {
  it("detects name mismatch", () => {
    expect(videoFilenameDiffers(project, "renamed.mp4")).toBe(true);
    expect(videoFilenameDiffers(project, "episode.mp4")).toBe(false);
  });
});

describe("formatVideoFilenameMismatch", () => {
  it("mentions both names", () => {
    expect(formatVideoFilenameMismatch(project, "new.mp4")).toContain(
      "episode.mp4",
    );
    expect(formatVideoFilenameMismatch(project, "new.mp4")).toContain(
      "new.mp4",
    );
  });
});

describe("resolveVideoForProject", () => {
  it("uses a valid session handle", async () => {
    const handle = mockHandle();
    const result = await resolveVideoForProject(project, {
      fsSupported: true,
      sessionHandle: handle,
    });
    expect(result?.handle).toBe(handle);
    expect(result?.file.name).toBe("episode.mp4");
  });

  it("clears stale cache and picks a new file", async () => {
    const stale = mockHandle();
    vi.mocked(stale.getFile).mockRejectedValue(
      new DOMException("gone", "NotFoundError"),
    );
    vi.spyOn(projectIo, "getCachedVideoHandle").mockResolvedValue(stale);

    const fresh = mockHandle("picked.mp4");
    const clearSpy = vi.spyOn(projectIo, "clearCachedVideoHandle");

    const result = await resolveVideoForProject(project, {
      fsSupported: true,
      pickVideo: async () => fresh,
    });

    expect(clearSpy).toHaveBeenCalled();
    expect(result?.file.name).toBe("picked.mp4");
  });

  it("returns null when permission is denied", async () => {
    const handle = mockHandle();
    vi.mocked(handle.queryPermission!).mockResolvedValue("denied");
    vi.mocked(handle.requestPermission!).mockResolvedValue("denied");

    const result = await resolveVideoForProject(project, {
      fsSupported: true,
      sessionHandle: handle,
    });
    expect(result).toBeNull();
  });
});

describe("canRestoreLastSession", () => {
  it("returns false for stale handles", async () => {
    const stale = mockHandle();
    vi.mocked(stale.getFile).mockRejectedValue(
      new DOMException("gone", "NotFoundError"),
    );
    vi.spyOn(projectIo, "getCachedVideoHandle").mockResolvedValue(stale);

    expect(await canRestoreLastSession("proj-1")).toBe(false);
  });
});
