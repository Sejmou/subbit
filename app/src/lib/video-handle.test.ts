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
  version: 2,
  id: "proj-1",
  name: "Show",
  videoName: "episode.mp4",
  fpsNumerator: 25,
  fpsDenominator: 1,
  startTimecode: "10:00:00:00",
  referenceStartSeconds: 0,
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

  it("skips cached handles that need a permission prompt during silent restore", async () => {
    const handle = mockHandle();
    vi.mocked(handle.queryPermission!).mockResolvedValue("prompt");
    vi.spyOn(projectIo, "getCachedVideoHandle").mockResolvedValue(handle);

    const result = await resolveVideoForProject(project, {
      fsSupported: true,
      requestPermission: false,
    });
    expect(result).toBeNull();
    expect(handle.getFile).not.toHaveBeenCalled();
  });

  it("requests permission on user-initiated open when handle is cached", async () => {
    const handle = mockHandle();
    vi.mocked(handle.queryPermission!)
      .mockResolvedValueOnce("prompt")
      .mockResolvedValueOnce("granted");
    vi.mocked(handle.requestPermission!).mockResolvedValue("granted");
    vi.spyOn(projectIo, "getCachedVideoHandle").mockResolvedValue(handle);

    const result = await resolveVideoForProject(project, {
      fsSupported: true,
      requestPermission: true,
    });
    expect(handle.requestPermission).toHaveBeenCalled();
    expect(result?.handle).toBe(handle);
  });

  it("does not throw when getFile is blocked without user gesture", async () => {
    const handle = mockHandle();
    vi.mocked(handle.queryPermission!).mockResolvedValue("granted");
    vi.mocked(handle.getFile).mockRejectedValue(
      new DOMException("not allowed", "NotAllowedError"),
    );

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

  it("returns true when permission still needs a user prompt", async () => {
    const handle = mockHandle();
    vi.mocked(handle.queryPermission!).mockResolvedValue("prompt");
    vi.spyOn(projectIo, "getCachedVideoHandle").mockResolvedValue(handle);

    expect(await canRestoreLastSession("proj-1")).toBe(true);
    expect(handle.getFile).not.toHaveBeenCalled();
  });
});
