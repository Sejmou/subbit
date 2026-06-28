import { describe, expect, it } from "vitest";
import {
  acceptRecordToInputAccept,
  isFileHandleStaleError,
  isFilePickerAbortError,
  serializeProject,
} from "./project-io";

describe("serializeProject", () => {
  it("preserves file size on video identity", () => {
    const text = serializeProject({
      version: 1,
      id: "00000000-0000-4000-8000-000000000001",
      name: "clip",
      videoName: "clip.mp4",
      fps: 25,
      timecodeOffset: "10:00:00:00",
      defaultShot: "ON",
      shots: [{ id: "ON", label: "On-screen" }],
      speakers: [],
      cues: [],
      video: {
        duration: 90,
        fileName: "clip.mp4",
        fileSize: 5_000_000,
        fingerprint: "legacy",
      },
    });
    expect(JSON.parse(text).video).toEqual({
      duration: 90,
      fileName: "clip.mp4",
      fileSize: 5_000_000,
    });
  });
});

describe("acceptRecordToInputAccept", () => {
  it("includes mime types and extensions", () => {
    expect(
      acceptRecordToInputAccept({
        "application/json": [".json"],
        "application/zip": [".zip"],
      }),
    ).toBe("application/json,.json,application/zip,.zip");
  });
});

describe("isFilePickerAbortError", () => {
  it("detects AbortError by name", () => {
    expect(isFilePickerAbortError(new DOMException("nope", "AbortError"))).toBe(
      true,
    );
    expect(
      isFilePickerAbortError(
        Object.assign(new Error("nope"), { name: "AbortError" }),
      ),
    ).toBe(true);
  });

  it("detects the browser cancel message", () => {
    expect(
      isFilePickerAbortError(
        new Error(
          "Failed to execute 'showOpenFilePicker' on 'Window': The user aborted a request.",
        ),
      ),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isFilePickerAbortError(new Error("disk full"))).toBe(false);
  });
});

describe("isFileHandleStaleError", () => {
  it("detects NotFoundError from stale handles", () => {
    expect(
      isFileHandleStaleError(new DOMException("gone", "NotFoundError")),
    ).toBe(true);
    expect(
      isFileHandleStaleError(
        Object.assign(new Error("gone"), { name: "NotFoundError" }),
      ),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isFileHandleStaleError(new Error("disk full"))).toBe(false);
  });
});
