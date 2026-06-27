import { useEffect } from "react";
import { handleShortcut } from "../lib/shortcuts";

/**
 * Global keyboard handling with two modes:
 *  - navigation (no text field focused): single-key shortcuts
 *  - editing (a cue textarea focused): typing works; only modifier combos act
 *
 * Capture phase so we can preventDefault before the focused <video> element
 * applies its own Space / arrow bindings (which would double-toggle playback).
 *
 * Bindings are defined in lib/shortcuts/registry.ts.
 */
export function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      handleShortcut(e);
    }

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
