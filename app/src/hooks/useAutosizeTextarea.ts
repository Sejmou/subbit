import { useLayoutEffect, type RefObject } from "react";

export function autosizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Grow a textarea to fit its content (single-line minimum). */
export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useLayoutEffect(() => {
    autosizeTextarea(ref.current);
  }, [ref, value]);
}
