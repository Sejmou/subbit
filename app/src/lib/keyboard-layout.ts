/**
 * Layout-aware key labels via navigator.keyboard.getLayoutMap() when available.
 * Falls back to US-centric defaults before the map loads or in unsupported browsers.
 */

const US_FALLBACK: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Quote: "'",
  Backslash: "\\",
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Backspace: "Backspace",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Digit0: "0",
  Home: "Home",
  End: "End",
  Slash: "/",
};

let layoutMap: ReadonlyMap<string, string> | null = null;
let loadPromise: Promise<void> | null = null;
let layoutVersion = 0;

function letterFromCode(code: string): string | null {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return null;
}

/** Human-readable label for one physical key (unmodified). */
export function keyLabelForCode(code: string): string {
  const fromMap = layoutMap?.get(code);
  let label: string;
  if (fromMap && fromMap.length > 0) {
    label = fromMap;
  } else {
    const letter = letterFromCode(code);
    if (letter) label = letter;
    else label = US_FALLBACK[code] ?? code;
  }

  if (code.startsWith("Key") && label.length === 1 && /[a-z]/i.test(label)) {
    return label.toUpperCase();
  }
  return label;
}

export interface KeyLabeler {
  code: (keyCode: string) => string;
  shift: (keyCode: string) => string;
  alt: (keyCode: string) => string;
  join: (parts: string[]) => string;
}

export function createKeyLabeler(): KeyLabeler {
  return {
    code: keyLabelForCode,
    shift: (code) => `Shift + ${keyLabelForCode(code)}`,
    alt: (code) => `Alt + ${keyLabelForCode(code)}`,
    join: (parts) => parts.join(" + "),
  };
}

/** Load the OS keyboard layout map (no-op if unavailable). */
export async function initKeyboardLayout(): Promise<void> {
  if (layoutMap) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const nav = navigator as Navigator & {
      keyboard?: { getLayoutMap: () => Promise<Map<string, string>> };
    };
    if (!nav.keyboard?.getLayoutMap) return;

    try {
      const map = await nav.keyboard.getLayoutMap();
      layoutMap = new Map(map);
      layoutVersion += 1;
    } catch {
      // Secure context or permission — keep fallbacks.
    }
  })();

  return loadPromise;
}

export function getKeyboardLayoutVersion(): number {
  return layoutVersion;
}

/** For tests — inject or clear a layout map. */
export function setKeyboardLayoutMapForTests(
  map: Record<string, string> | null,
): void {
  layoutMap = map ? new Map(Object.entries(map)) : null;
  layoutVersion += 1;
  loadPromise = null;
}
