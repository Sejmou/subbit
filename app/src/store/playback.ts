import { create } from "zustand";

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
  setVideoEl: (el) =>
    set((state) => (state.videoEl === el ? state : { videoEl: el })),
  setTime: (t) =>
    set((state) => (state.currentTime === t ? state : { currentTime: t })),
  setDuration: (d) =>
    set((state) => (state.duration === d ? state : { duration: d })),
  setPlaying: (p) =>
    set((state) => (state.playing === p ? state : { playing: p })),
  seek: (t) => {
    const { videoEl } = getState();
    const clamped = Math.max(0, t);
    if (videoEl && videoEl.currentTime !== clamped) {
      videoEl.currentTime = clamped;
    }
    set((state) =>
      state.currentTime === clamped ? state : { currentTime: clamped },
    );
  },
  playFrom: (t) => {
    const { videoEl } = getState();
    const clamped = Math.max(0, t);
    if (videoEl) {
      if (videoEl.currentTime !== clamped) videoEl.currentTime = clamped;
      void videoEl.play();
    }
    set((state) => {
      if (state.currentTime === clamped && state.playing) return state;
      return { currentTime: clamped, playing: true };
    });
  },
  togglePlay: () => {
    const { videoEl, playing } = getState();
    if (!videoEl) return;
    if (playing) videoEl.pause();
    else void videoEl.play();
  },
}));
