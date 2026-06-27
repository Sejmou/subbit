interface IconProps {
  className?: string;
}

export function SetupFolderIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M3 10h20" />
    </svg>
  );
}

/** Whisperx / AI transcript — the clanker. */
export function SetupClankerIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v2" />
      <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
      <rect x="5" y="7" width="14" height="12" rx="3" />
      <circle cx="9.5" cy="12.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12.5" r="1.25" fill="currentColor" stroke="none" />
      <path d="M9 16.5h6" />
      <path d="M3 11h2" />
      <path d="M19 11h2" />
      <path d="M5 20l-1 2" />
      <path d="M19 20l1 2" />
    </svg>
  );
}

export function SetupNewProjectIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 18v-4" />
      <path d="M10 16h4" />
    </svg>
  );
}

export function SetupManualIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h12" />
      <path d="M4 10h16" />
      <path d="M4 14h10" />
      <path d="M15.5 13.5l4.5 4.5-2 2-4.5-4.5 2-2z" />
      <path d="M17 12l2 2" />
    </svg>
  );
}
