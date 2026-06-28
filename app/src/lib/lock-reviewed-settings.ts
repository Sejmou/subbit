const KEY = "subbit:lockReviewedCues";

/** Default on — reviewed cues are locked until unreviewed. */
export function readLockReviewedCues(): boolean {
  try {
    const value = localStorage.getItem(KEY);
    if (value === null) return true;
    return value === "true";
  } catch {
    return true;
  }
}

export function writeLockReviewedCues(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, String(enabled));
  } catch {
    /* private browsing / quota — ignore */
  }
}
