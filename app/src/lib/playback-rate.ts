/** Preset playback speeds exposed in the UI and stepped by keyboard shortcuts. */
export const PLAYBACK_RATES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;

export function formatPlaybackRate(rate: number): string {
  if (Math.abs(rate - 1) < 0.001) return "1×";
  const text = Number.isInteger(rate)
    ? String(rate)
    : rate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}×`;
}

export function clampPlaybackRate(rate: number): PlaybackRate {
  const preset = PLAYBACK_RATES.find((r) => Math.abs(r - rate) < 0.001);
  if (preset !== undefined) return preset;
  return DEFAULT_PLAYBACK_RATE;
}

export function stepPlaybackRate(
  rate: number,
  direction: -1 | 1,
): PlaybackRate {
  const current = clampPlaybackRate(rate);
  const index = PLAYBACK_RATES.indexOf(current);
  const next = Math.max(
    0,
    Math.min(PLAYBACK_RATES.length - 1, index + direction),
  );
  return PLAYBACK_RATES[next];
}
