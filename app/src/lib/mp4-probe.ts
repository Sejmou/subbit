/** Rational frame rate read from an MP4/MOV container (not delivery SMPTE fps). */
export interface ProbedFrameRate {
  numerator: number;
  denominator: number;
}

const PROBE_HEAD_BYTES = 4 * 1024 * 1024;
const PROBE_TAIL_BYTES = 4 * 1024 * 1024;

const textDecoder = new TextDecoder();

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset);
}

function boxType(view: DataView, offset: number): string {
  return textDecoder.decode(
    new Uint8Array(view.buffer, view.byteOffset + offset + 4, 4),
  );
}

/** Walk ISO-BMFF boxes; invoke fn for each direct child. */
function forEachBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  fn: (type: string, contentStart: number, contentEnd: number) => void,
): void {
  let offset = start;
  while (offset + 8 <= end) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let size = readU32(view, offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    }
    if (size < header) return;
    const boxEnd = offset + size;
    if (boxEnd > end) return;
    const type = boxType(view, offset);
    fn(type, offset + header, boxEnd);
    offset = boxEnd;
  }
}

function findBox(
  bytes: Uint8Array,
  path: string[],
): { start: number; end: number } | null {
  if (path.length === 0) return null;

  function walk(
    start: number,
    end: number,
    depth: number,
  ): { start: number; end: number } | null {
    let found: { start: number; end: number } | null = null;
    forEachBox(bytes, start, end, (type, contentStart, boxEnd) => {
      if (found) return;
      if (type !== path[depth]) return;
      if (depth === path.length - 1) {
        found = { start: contentStart, end: boxEnd };
        return;
      }
      found = walk(contentStart, boxEnd, depth + 1);
    });
    return found;
  }

  return walk(0, bytes.length, 0);
}

function readMdhdTimescale(
  bytes: Uint8Array,
  start: number,
  end: number,
): number | null {
  if (end - start < 12) return null;
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + start,
    end - start,
  );
  const version = view.getUint8(0);
  if (version === 0) {
    if (end - start < 20) return null;
    return view.getUint32(12);
  }
  if (version === 1) {
    if (end - start < 28) return null;
    return view.getUint32(20);
  }
  return null;
}

function readStts(
  bytes: Uint8Array,
  start: number,
  end: number,
): ProbedFrameRate | null {
  if (end - start < 8) return null;
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + start,
    end - start,
  );
  if (view.getUint8(0) !== 0) return null;
  const entryCount = view.getUint32(4);
  let offset = 8;
  let totalSamples = 0;
  let totalTicks = 0;
  for (let i = 0; i < entryCount; i++) {
    if (offset + 8 > end - start) return null;
    const sampleCount = view.getUint32(offset);
    const sampleDelta = view.getUint32(offset + 4);
    offset += 8;
    if (sampleCount === 0 || sampleDelta === 0) continue;
    totalSamples += sampleCount;
    totalTicks += sampleCount * sampleDelta;
  }
  if (totalSamples === 0 || totalTicks === 0) return null;
  return { numerator: totalSamples, denominator: totalTicks };
}

function isVideoTrak(
  bytes: Uint8Array,
  trakStart: number,
  trakEnd: number,
): boolean {
  const hdlr = findBox(bytes.subarray(trakStart, trakEnd), ["mdia", "hdlr"]);
  if (!hdlr) return false;
  const absStart = trakStart + hdlr.start;
  const absEnd = trakStart + hdlr.end;
  if (absEnd - absStart < 12) return false;
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + absStart,
    absEnd - absStart,
  );
  const handler = textDecoder.decode(
    new Uint8Array(view.buffer, view.byteOffset + 8, 4),
  );
  return handler === "vide";
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function simplifyFrameRate(rate: ProbedFrameRate): ProbedFrameRate {
  const g = gcd(rate.numerator, rate.denominator);
  return { numerator: rate.numerator / g, denominator: rate.denominator / g };
}

/** @internal Exported for unit tests. */
export function probeFrameRateInBytes(
  bytes: Uint8Array,
): ProbedFrameRate | null {
  const moov = findBox(bytes, ["moov"]);
  if (!moov) return null;

  let result: ProbedFrameRate | null = null;
  forEachBox(bytes, moov.start, moov.end, (type, contentStart, boxEnd) => {
    if (result || type !== "trak") return;
    if (!isVideoTrak(bytes, contentStart, boxEnd)) return;

    const mdhd = findBox(bytes.subarray(contentStart, boxEnd), [
      "mdia",
      "mdhd",
    ]);
    const stts = findBox(bytes.subarray(contentStart, boxEnd), [
      "mdia",
      "minf",
      "stbl",
      "stts",
    ]);
    if (!mdhd || !stts) return;

    const timescale = readMdhdTimescale(
      bytes,
      contentStart + mdhd.start,
      contentStart + mdhd.end,
    );
    const delta = readStts(
      bytes,
      contentStart + stts.start,
      contentStart + stts.end,
    );
    if (!timescale || !delta) return;

    // fps = timescale / avgDelta = timescale * totalSamples / totalTicks
    result = simplifyFrameRate({
      numerator: timescale * delta.numerator,
      denominator: delta.denominator,
    });
  });

  return result;
}

function containsMoov(bytes: Uint8Array): boolean {
  return findBox(bytes, ["moov"]) !== null;
}

async function readProbeBytes(file: File): Promise<Uint8Array> {
  if (file.size <= PROBE_HEAD_BYTES) {
    return new Uint8Array(await file.slice(0, file.size).arrayBuffer());
  }

  const head = new Uint8Array(
    await file.slice(0, PROBE_HEAD_BYTES).arrayBuffer(),
  );
  if (containsMoov(head)) return head;

  const tailStart = Math.max(0, file.size - PROBE_TAIL_BYTES);
  const tail = new Uint8Array(
    await file.slice(tailStart, file.size).arrayBuffer(),
  );
  if (containsMoov(tail)) return tail;

  // Last resort: search both regions (moov may straddle the boundary on tiny edge cases).
  const combined = new Uint8Array(head.length + tail.length);
  combined.set(head, 0);
  combined.set(tail, head.length);
  return combined;
}

/** Read average video frame rate from an MP4/MOV file header (moov). */
export async function probeMp4FrameRate(
  file: File,
): Promise<ProbedFrameRate | null> {
  try {
    const bytes = await readProbeBytes(file);
    const rate = probeFrameRateInBytes(bytes);
    if (!rate || rate.numerator <= 0 || rate.denominator <= 0) return null;
    return rate;
  } catch {
    return null;
  }
}

/** Format a probed frame rate for display, e.g. "25" or "23.976". */
export function formatFrameRate(
  numerator: number,
  denominator: number,
): string {
  const value = numerator / denominator;
  if (Math.abs(value - Math.round(value)) < 0.001)
    return String(Math.round(value));
  return value.toFixed(3).replace(/\.?0+$/, "");
}
