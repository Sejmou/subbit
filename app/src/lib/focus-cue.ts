export type FocusCueScroll = "auto" | "start" | "center" | "end";

export interface FocusCueDetail {
  cueId: string;
  scroll: FocusCueScroll;
  segIndex?: number;
  selStart?: number;
  selEnd?: number;
}

export interface ToggleCueNoteDetail {
  cueId: string;
  /** When true, focus the note field after opening. */
  focus?: boolean;
  /** Force open or closed; omit to toggle. */
  open?: boolean;
}

/** Open or toggle the note editor for a cue. */
export function toggleCueNote(
  cueId: string,
  options?: { focus?: boolean; open?: boolean },
) {
  const detail: ToggleCueNoteDetail = { cueId, ...options };
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent("subbit:toggle-note", { detail }));
  });
}

/** Focus a cue's text field after the list scroll and row mount have settled. */
export function focusCueForEdit(
  cueId: string,
  options?: {
    scroll?: FocusCueScroll;
    segIndex?: number;
    selStart?: number;
    selEnd?: number;
  },
) {
  const detail: FocusCueDetail = {
    cueId,
    scroll: options?.scroll ?? "auto",
    segIndex: options?.segIndex,
    selStart: options?.selStart,
    selEnd: options?.selEnd,
  };
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent("subbit:focus-cue", { detail }));
  });
}
