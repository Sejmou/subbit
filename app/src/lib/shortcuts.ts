/**
 * Single source of truth for keyboard shortcuts, shown in the in-app help
 * overlay (press `?`). Keep this in sync with the handler in useShortcuts.ts.
 */
export interface Shortcut {
  keys: string
  description: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

/** "Cmd" on macOS, "Ctrl" elsewhere - for nicer labels in the overlay. */
export const MOD_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl'

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Playback & navigation',
    shortcuts: [
      { keys: 'Space', description: 'Play / pause' },
      { keys: 'J / K  or  ↓ / ↑', description: 'Next / previous cue' },
      { keys: '← / →', description: 'Jog playhead 1 frame' },
      { keys: 'Shift + ← / →', description: 'Jog playhead 1 second' },
      { keys: 'G', description: 'Seek video to the selected cue' },
    ],
  },
  {
    title: 'Timing',
    shortcuts: [
      { keys: 'I', description: 'Set cue In to the playhead' },
      { keys: 'O', description: 'Set cue Out to the playhead' },
      { keys: '[', description: 'Nudge In 1 frame (Shift = other direction)' },
      { keys: ']', description: 'Nudge Out 1 frame (Shift = other direction)' },
    ],
  },
  {
    title: 'Metadata',
    shortcuts: [
      { keys: '1 - 9', description: 'Assign that speaker (Rolle) to the cue' },
      { keys: 'Shift + 1 / 2 / 3 …', description: "Set the active segment's shot type" },
      { keys: 'R', description: 'Toggle "reviewed"' },
    ],
  },
  {
    title: 'Text & structure',
    shortcuts: [
      { keys: 'Enter', description: 'Edit the selected cue (focus its text)' },
      { keys: 'Esc', description: 'Leave the text box (back to navigation)' },
      { keys: 'M', description: 'Merge the selected cue with the next' },
      { keys: 'Shift + M', description: 'Unmerge at the active segment (split back into separate cues)' },
      { keys: `${MOD_LABEL} + Enter`, description: 'Split cue at the caret + playhead' },
      { keys: `${MOD_LABEL} + Shift + S`, description: 'Insert a shot change at the caret' },
    ],
  },
  {
    title: 'Project',
    shortcuts: [
      { keys: `${MOD_LABEL} + Z`, description: 'Undo' },
      { keys: `${MOD_LABEL} + Shift + Z`, description: 'Redo' },
      { keys: `${MOD_LABEL} + S`, description: 'Save project' },
      { keys: '?', description: 'Show / hide this help' },
    ],
  },
]
