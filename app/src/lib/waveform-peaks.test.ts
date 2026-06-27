import { describe, expect, it } from "vitest";
import {
  formatWaveformDurationMismatch,
  parseWaveformDat,
  parseWaveformJsonText,
  peaksDuration,
  peaksMaxZoomVisibleSeconds,
  peaksInitialZoomSeconds,
  peaksZoomLevels,
} from "./waveform-peaks";

/** Build a minimal v2 8-bit mono .dat header + one min/max pair. */
function makeDatV2(opts: {
  sampleRate: number;
  samplesPerPixel: number;
  length: number;
  min?: number;
  max?: number;
}): ArrayBuffer {
  const headerBytes = 24;
  const dataBytes = opts.length * 2;
  const buf = new ArrayBuffer(headerBytes + dataBytes);
  const view = new DataView(buf);
  view.setInt32(0, 2, true); // version
  view.setUint32(4, 1, true); // flags: 8-bit
  view.setInt32(8, opts.sampleRate, true);
  view.setInt32(12, opts.samplesPerPixel, true);
  view.setUint32(16, opts.length, true);
  view.setInt32(20, 1, true); // channels
  view.setInt8(24, opts.min ?? -10);
  view.setInt8(25, opts.max ?? 10);
  return buf;
}

describe("parseWaveformDat", () => {
  it("parses a valid v2 mono dat file", () => {
    const buf = makeDatV2({
      sampleRate: 44100,
      samplesPerPixel: 512,
      length: 1,
    });
    const parsed = parseWaveformDat(buf);
    expect(parsed.meta.sampleRate).toBe(44100);
    expect(parsed.meta.bits).toBe(8);
    expect(parsed.meta.duration).toBeCloseTo(512 / 44100);
    expect(parsed.input.kind).toBe("dat");
  });

  it("rejects 16-bit dat files", () => {
    const buf = makeDatV2({
      sampleRate: 44100,
      samplesPerPixel: 512,
      length: 1,
    });
    const view = new DataView(buf);
    view.setUint32(4, 0, true); // 16-bit flag
    expect(() => parseWaveformDat(buf)).toThrow(/8-bit/);
  });
});

describe("parseWaveformJsonText", () => {
  it("parses audiowaveform JSON", () => {
    const text = JSON.stringify({
      version: 2,
      channels: 1,
      sample_rate: 48000,
      samples_per_pixel: 256,
      bits: 8,
      length: 2,
      data: [-5, 5, -3, 7],
    });
    const parsed = parseWaveformJsonText(text);
    expect(parsed.meta.channels).toBe(1);
    expect(parsed.meta.duration).toBeCloseTo((2 * 256) / 48000);
    expect(parsed.input.kind).toBe("json");
  });
});

describe("peaksZoomLevels", () => {
  it("starts at native samples_per_pixel and doubles", () => {
    expect(peaksZoomLevels(2205)).toEqual([
      2205, 4410, 8820, 17640, 35280, 70560,
    ]);
  });
});

describe("peaksMaxZoomVisibleSeconds", () => {
  it("computes minimum visible span at native zoom", () => {
    // 800px, 2205 samples/px, 44100 Hz → 40s
    expect(peaksMaxZoomVisibleSeconds(2205, 44100, 800)).toBeCloseTo(40);
  });
});

describe("peaksInitialZoomSeconds", () => {
  it("uses max zoom span capped by video duration", () => {
    expect(
      peaksInitialZoomSeconds(
        { samplesPerPixel: 2205, sampleRate: 44100 },
        800,
        7200,
      ),
    ).toBeCloseTo(40);
    expect(
      peaksInitialZoomSeconds(
        { samplesPerPixel: 2205, sampleRate: 44100 },
        800,
        30,
      ),
    ).toBe(30);
  });
});

describe("peaksDuration", () => {
  it("computes duration from header fields", () => {
    expect(
      peaksDuration({ length: 100, samplesPerPixel: 512, sampleRate: 44100 }),
    ).toBeCloseTo((100 * 512) / 44100);
  });
});

describe("formatWaveformDurationMismatch", () => {
  it("returns null when within tolerance", () => {
    expect(formatWaveformDurationMismatch(3600, 3600.2)).toBeNull();
  });

  it("warns when durations differ", () => {
    expect(formatWaveformDurationMismatch(3600, 7200)).toMatch(
      /does not match/,
    );
  });
});
