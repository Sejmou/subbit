import { create } from "zustand";
import {
  DEFAULT_PLAYBACK_RATE,
  clampPlaybackRate,
  stepPlaybackRate,
} from "../lib/playback-rate";

/**
 * Transient playback state, kept separate from the project so frequent
 * timeupdate events don't re-render editing components unnecessarily.
 */
interface PlaybackState {
  currentTime: number;
  duration: number;
  playing: boolean;
  playbackRate: number;
  /** Imperative handle to the <video>, set by the player. */
  videoEl: HTMLVideoElement | null;
  setVideoEl: (el: HTMLVideoElement | null) => void;
  setTime: (t: number) => void;
  setDuration: (d: number) => void;
  setPlaying: (p: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  stepPlaybackRate: (direction: -1 | 1) => void;
  /** Seek the underlying media element (also updates currentTime). */
  seek: (t: number) => void;
  /** Seek to `t` and start playback. */
  playFrom: (t: number) => void;
  togglePlay: () => void;
}

function applyPlaybackRate(videoEl: HTMLVideoElement | null, rate: number) {
  if (videoEl) videoEl.playbackRate = rate;
}

export const usePlayback = create<PlaybackState>((set, getState) => ({
  currentTime: 0,
  duration: 0,
  playing: false,
  playbackRate: DEFAULT_PLAYBACK_RATE,
  videoEl: null,
  setVideoEl: (el) => {
    if (el) applyPlaybackRate(el, getState().playbackRate);
    set((state) => (state.videoEl === el ? state : { videoEl: el }));
  },
  setTime: (t) =>
    set((state) => (state.currentTime === t ? state : { currentTime: t })),
  setDuration: (d) =>
    set((state) => (state.duration === d ? state : { duration: d })),
  setPlaying: (p) =>
    set((state) => (state.playing === p ? state : { playing: p })),
  setPlaybackRate: (rate) => {
    const clamped = clampPlaybackRate(rate);
    applyPlaybackRate(getState().videoEl, clamped);
    set((state) =>
      state.playbackRate === clamped ? state : { playbackRate: clamped },
    );
  },
  stepPlaybackRate: (direction) => {
    getState().setPlaybackRate(
      stepPlaybackRate(getState().playbackRate, direction),
    );
  },
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
