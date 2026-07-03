import { PLAYBACK_RATES, formatPlaybackRate } from "../lib/playback-rate";
import { usePlayback } from "../store/playback";
import { useShortcutLabel } from "../hooks/useShortcutLabel";
import { useTip } from "./Tooltip";

/** Compact playback speed control for the timeline toolbar. */
export function PlaybackSpeedControl() {
  const tip = useTip();
  const playbackRate = usePlayback((s) => s.playbackRate);
  const setPlaybackRate = usePlayback((s) => s.setPlaybackRate);
  const stepPlaybackRate = usePlayback((s) => s.stepPlaybackRate);
  const slowerLabel = useShortcutLabel("playback-slower");
  const fasterLabel = useShortcutLabel("playback-faster");

  return (
    <div className="playback-speed-control">
      <span className="playback-speed-label">Speed</span>
      <span className="tooltip-wrap" {...tip(`Slower (${slowerLabel})`)}>
        <button
          type="button"
          className="playback-speed-step-btn"
          onClick={() => stepPlaybackRate(-1)}
          disabled={playbackRate <= PLAYBACK_RATES[0]}
          aria-label="Decrease playback speed"
        >
          −
        </button>
      </span>
      <span
        className="tooltip-wrap"
        {...tip(`Playback speed (${slowerLabel} / ${fasterLabel})`)}
      >
        <select
          className="playback-speed-select"
          value={playbackRate}
          onChange={(e) => setPlaybackRate(Number(e.target.value))}
          aria-label="Playback speed"
        >
          {PLAYBACK_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {formatPlaybackRate(rate)}
            </option>
          ))}
        </select>
      </span>
      <span className="tooltip-wrap" {...tip(`Faster (${fasterLabel})`)}>
        <button
          type="button"
          className="playback-speed-step-btn"
          onClick={() => stepPlaybackRate(1)}
          disabled={playbackRate >= PLAYBACK_RATES.at(-1)!}
          aria-label="Increase playback speed"
        >
          +
        </button>
      </span>
    </div>
  );
}
