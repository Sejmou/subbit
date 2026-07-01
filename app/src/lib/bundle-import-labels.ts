/** File picker label — user-facing term is “backup”; bundle is the on-disk format. */
export const BACKUP_FILE_PICKER_LABEL = "Subbit backup (.zip)";

/** Labels for version-history snapshots around backup import. */
export const PRE_BACKUP_RESTORE_HISTORY_LABEL = "before backup restore";

export function postBackupRestoreHistoryLabel(fileName: string): string {
  const trimmed = fileName.trim() || "backup";
  return `backup restore (${trimmed})`;
}

export function postBackupCopyHistoryLabel(fileName: string): string {
  const trimmed = fileName.trim() || "backup";
  return `backup opened as copy (${trimmed})`;
}
