let setupDialogOpen = false;

export function isSetupDialogOpen(): boolean {
  return setupDialogOpen;
}

export function setSetupDialogOpen(open: boolean): void {
  setupDialogOpen = open;
}
