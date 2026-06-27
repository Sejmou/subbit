import { useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/** Trap Tab focus inside a modal and optionally handle Escape. */
export function useModalFocusTrap(open: boolean, onEscape?: () => void) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const root = modalRef.current;
    if (!root) return;
    const modal: HTMLElement = root;

    const id = requestAnimationFrame(() => {
      focusableElements(modal)[0]?.focus();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusableElements(modal);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && modal.contains(active);

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(e: FocusEvent) {
      if (e.target instanceof Node && modal.contains(e.target)) return;
      e.stopPropagation();
      focusableElements(modal)[0]?.focus();
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [open, onEscape]);

  return modalRef;
}
