/** Human-readable elapsed time, e.g. "just now", "3 min ago", "2 h ago". */
export function formatRelativeTime(ts: number, now = Date.now()): string {
  const mins = Math.round((now - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}
