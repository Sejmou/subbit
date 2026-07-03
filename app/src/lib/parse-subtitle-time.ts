/** Parse SRT/VTT-style timestamp to subtitle-relative seconds. */
export function parseClockTimestamp(raw: string): number {
  const trimmed = raw.trim();
  const comma = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (comma) {
    const h = Number(comma[1]);
    const m = Number(comma[2]);
    const s = Number(comma[3]);
    const ms = Number(comma[4]);
    return h * 3600 + m * 60 + s + ms / 1000;
  }

  const dot = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (dot) {
    const h = Number(dot[1]);
    const m = Number(dot[2]);
    const s = Number(dot[3]);
    const ms = Number(dot[4]);
    return h * 3600 + m * 60 + s + ms / 1000;
  }

  const short = trimmed.match(/^(\d{1,2}):(\d{2})\.(\d{3})$/);
  if (short) {
    const m = Number(short[1]);
    const s = Number(short[2]);
    const ms = Number(short[3]);
    return m * 60 + s + ms / 1000;
  }

  throw new Error(`Unrecognized subtitle timestamp: ${raw}`);
}

/** Parse ASS timestamp H:MM:SS.cc (centiseconds) to subtitle-relative seconds. */
export function parseAssTimestamp(raw: string): number {
  const m = raw.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
  if (!m) throw new Error(`Unrecognized ASS timestamp: ${raw}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const cs = Number(m[4]);
  return h * 3600 + min * 60 + sec + cs / 100;
}
