/** "Cmd" on macOS, "Ctrl" elsewhere — for labels in the help overlay and tooltips. */
export function modLabel(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? 'Cmd'
    : 'Ctrl'
}

export const MOD_LABEL = modLabel()
