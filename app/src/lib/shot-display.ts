/** User-facing shot label; falls back to the export id when label is empty. */
export function shotDisplayLabel(id: string, label: string): string {
  const trimmed = label.trim();
  return trimmed || id;
}
