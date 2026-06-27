let findReplaceOpen = false;

export function isFindReplaceOpen(): boolean {
  return findReplaceOpen;
}

export function setFindReplaceOpen(open: boolean): void {
  findReplaceOpen = open;
}

export function toggleFindReplaceDialog(): void {
  window.dispatchEvent(new CustomEvent("subbit:find-replace-toggle"));
}
