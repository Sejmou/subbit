import { useEffect, useLayoutEffect, type RefObject } from "react";

export function autosizeTextarea(
  el: HTMLTextAreaElement | null,
  wrap?: HTMLElement | null,
) {
  if (!el) return;
  el.style.height = "auto";
  const height = `${el.scrollHeight}px`;
  el.style.height = height;
  if (wrap) wrap.style.minHeight = height;
}

/** Grow a textarea to fit its content (single-line minimum). */
export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  wrapRef?: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    autosizeTextarea(ref.current, wrapRef?.current ?? null);
  }, [ref, wrapRef, value]);

  useEffect(() => {
    const target = wrapRef?.current ?? ref.current;
    if (!target) return;

    const ro = new ResizeObserver(() => {
      autosizeTextarea(ref.current, wrapRef?.current ?? null);
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [ref, wrapRef]);
}
