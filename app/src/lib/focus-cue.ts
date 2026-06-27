export type FocusCueScroll = "auto" | "start" | "center" | "end";

export interface FocusCueDetail {
  cueId: string;
  scroll: FocusCueScroll;
  segIndex?: number;
  selStart?: number;
  selEnd?: number;
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
