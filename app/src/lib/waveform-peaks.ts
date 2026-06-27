/**
 * Parse and validate audiowaveform peak files (.dat / .json) for peaks.js.
 *
 * @see https://github.com/bbc/audiowaveform/blob/master/doc/DataFormat.md
 */

/** JSON format produced by `audiowaveform -o file.json`. */
export interface AudiowaveformJson {
  version: number;
  channels?: number;
  sample_rate: number;
  samples_per_pixel: number;
  bits: number;
  length: number;
  data: number[];
}

export interface WaveformPeaksMeta {
  duration: number;
  sampleRate: number;
  samplesPerPixel: number;
  length: number;
  bits: 8 | 16;
  channels: number;
}

/** Payload shape expected by peaks.js `waveformData` option. */
export type WaveformPeaksInput =
  | { kind: "dat"; arrayBuffer: ArrayBuffer }
  | { kind: "json"; json: AudiowaveformJson };

export interface ParsedWaveformPeaks {
  input: WaveformPeaksInput;
  meta: WaveformPeaksMeta;
}

const PEAKS_JS_BITS = 8;

/** Defaults from `waveform/generate.sh` (mono 44.1 kHz, 80 px/s, 8-bit). */
export const WAVEFORM_GEN_SAMPLE_RATE = 44100;
export const WAVEFORM_GEN_PIXELS_PER_SECOND = 80;

/** Native zoom resolution for peaks produced by the repo waveform script. */
export function waveformGenSamplesPerPixel(
  sampleRate = WAVEFORM_GEN_SAMPLE_RATE,
  pixelsPerSecond = WAVEFORM_GEN_PIXELS_PER_SECOND,
): number {
  return Math.round(sampleRate / pixelsPerSecond);
}

/**
 * Flat audiowaveform-shaped peaks for timeline-only mode (no imported .dat).
 * Uses the same sample rate, samples_per_pixel, and zoom ladder as real files.
 */
export function buildPlaceholderWaveformPeaks(
  durationSeconds: number,
): ParsedWaveformPeaks {
  const sampleRate = WAVEFORM_GEN_SAMPLE_RATE;
  const samplesPerPixel = waveformGenSamplesPerPixel();
  const safeDuration = Math.max(0.001, durationSeconds);
  const length = Math.max(
    1,
    Math.ceil((safeDuration * sampleRate) / samplesPerPixel),
  );
  const data = new Array<number>(length * 2).fill(0);
  const json: AudiowaveformJson = {
    version: 2,
    channels: 1,
    sample_rate: sampleRate,
    samples_per_pixel: samplesPerPixel,
    bits: PEAKS_JS_BITS,
    length,
    data,
  };
  const meta: WaveformPeaksMeta = {
    sampleRate,
    samplesPerPixel,
    length,
    bits: PEAKS_JS_BITS,
    channels: 1,
    duration: peaksDuration({ length, samplesPerPixel, sampleRate }),
  };
  return { input: { kind: "json", json }, meta };
}

export function peaksDuration(
  meta: Pick<WaveformPeaksMeta, "length" | "samplesPerPixel" | "sampleRate">,
): number {
  return (meta.length * meta.samplesPerPixel) / meta.sampleRate;
}

/**
 * peaks.js zoomLevels are samples-per-pixel values in ascending order.
 * Cannot zoom in past the precomputed file's native samples_per_pixel.
 */
export function peaksZoomLevels(samplesPerPixel: number, steps = 6): number[] {
  const min = Math.max(1, Math.ceil(samplesPerPixel));
  const levels = [min];
  let level = min;
  for (let i = 1; i < steps; i++) {
    level = Math.ceil(level * 2);
    levels.push(level);
  }
  return levels;
}

/** Shortest span (seconds) visible when zoomed in to the peaks file's native limit. */
export function peaksMaxZoomVisibleSeconds(
  samplesPerPixel: number,
  sampleRate: number,
  viewWidthPx: number,
): number {
  return (viewWidthPx * samplesPerPixel) / sampleRate;
}

/** Default zoomview span on load: max zoom allowed by the imported peaks file. */
export function peaksInitialZoomSeconds(
  meta: Pick<WaveformPeaksMeta, "samplesPerPixel" | "sampleRate">,
  viewWidthPx: number,
  duration: number,
): number {
  const maxZoomSpan = peaksMaxZoomVisibleSeconds(
    meta.samplesPerPixel,
    meta.sampleRate,
    viewWidthPx,
  );
  return Math.min(Math.max(maxZoomSpan, 0.5), duration);
}

/** Target `--pixels-per-second` when regenerating peaks (~targetSeconds at max zoom). */
export function peaksPixelsPerSecondForZoom(
  targetMinVisibleSeconds: number,
  viewWidthPx: number,
): number {
  return Math.ceil(viewWidthPx / targetMinVisibleSeconds);
}

function parseDatHeader(view: DataView): WaveformPeaksMeta {
  if (view.byteLength < 20) {
    throw new Error(
      "Waveform .dat file is too small to contain a valid header.",
    );
  }

  const version = view.getInt32(0, true);
  if (version !== 1 && version !== 2) {
    throw new Error(
      `Unsupported waveform .dat version ${version} (expected 1 or 2).`,
    );
  }

  const flags = view.getUint32(4, true);
  const bits: 8 | 16 = flags & 1 ? 8 : 16;
  const sampleRate = view.getInt32(8, true);
  const samplesPerPixel = view.getInt32(12, true);
  const length = view.getUint32(16, true);
  const channels = version === 2 ? view.getInt32(20, true) : 1;

  if (sampleRate <= 0 || samplesPerPixel <= 0 || length <= 0 || channels <= 0) {
    throw new Error(
      "Waveform .dat header has invalid sample rate, resolution, length, or channel count.",
    );
  }

  if (bits !== PEAKS_JS_BITS) {
    throw new Error(
      `Waveform .dat uses ${bits}-bit peaks; peaks.js requires 8-bit. Regenerate with audiowaveform -b 8.`,
    );
  }

  const headerBytes = version === 2 ? 24 : 20;
  const expectedDataBytes = length * channels * 2;
  if (view.byteLength < headerBytes + expectedDataBytes) {
    throw new Error(
      "Waveform .dat file is truncated (data shorter than header declares).",
    );
  }

  const meta: WaveformPeaksMeta = {
    sampleRate,
    samplesPerPixel,
    length,
    bits,
    channels,
    duration: peaksDuration({ length, samplesPerPixel, sampleRate }),
  };
  return meta;
}

function parseJsonObject(obj: unknown): {
  json: AudiowaveformJson;
  meta: WaveformPeaksMeta;
} {
  if (typeof obj !== "object" || obj === null) {
    throw new Error("Waveform JSON must be an object.");
  }
  const raw = obj as Record<string, unknown>;

  const version = raw.version;
  const sampleRate = raw.sample_rate;
  const samplesPerPixel = raw.samples_per_pixel;
  const bits = raw.bits;
  const length = raw.length;
  const data = raw.data;
  const channels = raw.channels ?? 1;

  if (typeof version !== "number" || (version !== 1 && version !== 2)) {
    throw new Error(
      'Waveform JSON has an unsupported or missing "version" field.',
    );
  }
  if (typeof sampleRate !== "number" || sampleRate <= 0) {
    throw new Error('Waveform JSON is missing a valid "sample_rate".');
  }
  if (typeof samplesPerPixel !== "number" || samplesPerPixel <= 0) {
    throw new Error('Waveform JSON is missing a valid "samples_per_pixel".');
  }
  if (bits !== PEAKS_JS_BITS) {
    throw new Error(
      `Waveform JSON uses ${String(bits)}-bit peaks; peaks.js requires 8-bit. Regenerate with audiowaveform -b 8.`,
    );
  }
  if (typeof length !== "number" || length <= 0) {
    throw new Error('Waveform JSON is missing a valid "length".');
  }
  if (
    !Array.isArray(data) ||
    data.length < length * (typeof channels === "number" ? channels : 1) * 2
  ) {
    throw new Error(
      'Waveform JSON "data" array is missing or too short for the declared length.',
    );
  }

  const channelCount = typeof channels === "number" ? channels : 1;
  const json: AudiowaveformJson = {
    version,
    sample_rate: sampleRate,
    samples_per_pixel: samplesPerPixel,
    bits,
    length,
    data: data as number[],
    channels: channelCount,
  };

  const meta: WaveformPeaksMeta = {
    sampleRate,
    samplesPerPixel,
    length,
    bits: PEAKS_JS_BITS,
    channels: channelCount,
    duration: peaksDuration({ length, samplesPerPixel, sampleRate }),
  };

  return { json, meta };
}

export function parseWaveformDat(
  arrayBuffer: ArrayBuffer,
): ParsedWaveformPeaks {
  const meta = parseDatHeader(new DataView(arrayBuffer));
  return { input: { kind: "dat", arrayBuffer }, meta };
}

export function parseWaveformJsonText(text: string): ParsedWaveformPeaks {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Could not parse waveform file as JSON.");
  }
  const { json, meta } = parseJsonObject(data);
  return { input: { kind: "json", json }, meta };
}

/** Load peaks from a user-picked File (.dat or audiowaveform .json). */
export async function parseWaveformPeaksFile(
  file: File,
): Promise<ParsedWaveformPeaks> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".dat")) {
    return parseWaveformDat(await file.arrayBuffer());
  }
  if (lower.endsWith(".json")) {
    return parseWaveformJsonText(await file.text());
  }
  throw new Error(
    "Expected a .dat or .json waveform peaks file (from audiowaveform).",
  );
}

/** Warn when peaks duration differs from the loaded video. */
export function formatWaveformDurationMismatch(
  peaksDurationS: number,
  videoDurationS: number,
  toleranceS = 0.5,
): string | null {
  if (Math.abs(peaksDurationS - videoDurationS) <= toleranceS) return null;
  return (
    `Waveform duration (${peaksDurationS.toFixed(1)}s) does not match the loaded video ` +
    `(${videoDurationS.toFixed(1)}s). The peaks file may be from a different cut or export.`
  );
}
