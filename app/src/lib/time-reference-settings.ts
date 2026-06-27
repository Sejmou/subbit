import type { TimeReference } from "../store/time-reference";

const KEY = "subbit:timeReference";

export function readTimeReference(): TimeReference {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "file" || value === "program") return value;
  } catch {
    /* ignore */
  }
  return "program";
}

export function writeTimeReference(reference: TimeReference): void {
  try {
    localStorage.setItem(KEY, reference);
  } catch {
    /* private browsing / quota — ignore */
  }
}
