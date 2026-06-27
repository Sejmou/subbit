import { describe, expect, it } from "vitest";
import { isFilePickerAbortError } from "./project-io";

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
