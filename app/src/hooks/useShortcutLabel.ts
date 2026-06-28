import { useKeyboardLayoutStore } from "../store/keyboard-layout";
import { createKeyLabeler } from "../lib/keyboard-layout";
import { shortcutLabel } from "../lib/shortcuts/registry";

/** Shortcut label that updates when the keyboard layout map loads. */
export function useShortcutLabel(id: string, mod?: string): string {
  useKeyboardLayoutStore((s) => s.version);
  return shortcutLabel(id, mod);
}

/** Layout-aware label for one physical key (e.g. tooltip for `KeyH`). */
export function useKeyLabel(code: string): string {
  useKeyboardLayoutStore((s) => s.version);
  return createKeyLabeler().code(code);
}
