import { describe, expect, it } from "vitest";
import {
  BUNDLE_WAVEFORM_DAT,
  buildProjectBundleZip,
  parseProjectBundleZip,
} from "./project-bundle";

describe("project-bundle", () => {
  it("round-trips project json and waveform dat", () => {
    const projectText = '{"version":1,"name":"Test"}';
    const waveform = {
      fileName: BUNDLE_WAVEFORM_DAT,
      bytes: new Uint8Array([1, 2, 3, 4]),
    };
    const zip = buildProjectBundleZip(projectText, waveform);
    const parsed = parseProjectBundleZip(zip);
    expect(parsed.projectText).toBe(projectText);
    expect(parsed.waveform?.fileName).toBe(BUNDLE_WAVEFORM_DAT);
    expect(Array.from(parsed.waveform!.bytes)).toEqual([1, 2, 3, 4]);
  });

  it("parses project-only bundles", () => {
    const zip = buildProjectBundleZip('{"id":"x"}');
    const parsed = parseProjectBundleZip(zip);
    expect(parsed.projectText).toBe('{"id":"x"}');
    expect(parsed.waveform).toBeUndefined();
  });

  it("requires a project json entry", () => {
    expect(() =>
      parseProjectBundleZip(
        new Uint8Array([
          0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0,
        ]),
      ),
    ).toThrow(/project\.json/);
  });
});
