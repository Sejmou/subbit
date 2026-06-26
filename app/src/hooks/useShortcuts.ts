import { useEffect } from 'react'
import { handleShortcut } from '../lib/shortcuts'

/**
 * Global keyboard handling with two modes:
 *  - navigation (no text field focused): single-key shortcuts
 *  - editing (a cue textarea focused): typing works; only modifier combos act
 *
 * Bindings are defined in lib/shortcuts/registry.ts.
 */
export function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      handleShortcut(e)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
