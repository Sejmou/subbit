import { create } from "zustand";

/** Subtract this from the playhead when marking timing during playback (reaction delay). */
export const REACTION_DELAY_S = 0.5;

/** Playhead time for cue In/Out/insert; shifted back while the video is playing. */
export function reactionAdjustedPlayhead(
  time: number,
  playing: boolean,
): number {
  return Math.max(0, playing ? time - REACTION_DELAY_S : time);
}

/**
 * Transient playback state, kept separate from the project so frequent
 * timeupdate events don't re-render editing components unnecessarily.
 */
interface PlaybackState {
  currentTime: number;
  duration: number;
  playing: boolean;
  /** Imperative handle to the <video>, set by the player. */
  videoEl: HTMLVideoElement | null;
  setVideoEl: (el: HTMLVideoElement | null) => void;
  setTime: (t: number) => void;
  setDuration: (d: number) => void;
  setPlaying: (p: boolean) => void;
  /** Seek the underlying media element (also updates currentTime). */
  seek: (t: number) => void;
  /** Seek to `t` and start playback. */
  playFrom: (t: number) => void;
  togglePlay: () => void;
}

export const usePlayback = create<PlaybackState>((set, getState) => ({
  currentTime: 0,
  duration: 0,
  playing: false,
  videoEl: null,
  setVideoEl: (el) => set({ videoEl: el }),
  setTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setPlaying: (p) => set({ playing: p }),
  seek: (t) => {
    const { videoEl } = getState();
    const clamped = Math.max(0, t);
    if (videoEl) videoEl.currentTime = clamped;
    set({ currentTime: clamped });
  },
  playFrom: (t) => {
    const { videoEl } = getState();
    const clamped = Math.max(0, t);
    if (videoEl) {
      videoEl.currentTime = clamped;
      void videoEl.play();
    }
    set({ currentTime: clamped, playing: true });
  },
  togglePlay: () => {
    const { videoEl, playing } = getState();
    if (!videoEl) return;
    if (playing) videoEl.pause();
    else void videoEl.play();
  },
}));
