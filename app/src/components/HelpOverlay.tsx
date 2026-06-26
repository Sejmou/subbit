import { useEffect } from 'react'
import { MOD_LABEL, SHORTCUT_GROUPS } from '../lib/shortcuts'

/** Modal cheat sheet of keyboard shortcuts. Close with Esc, ?, or backdrop. */
export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div className="help-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-head">
          <h2>Keyboard shortcuts</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <p className="hint">
          Single-key shortcuts work in navigation mode (no text box focused).
          The {MOD_LABEL} combos also work while editing text.
        </p>
        <div className="help-grid">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.shortcuts.map((s) => (
                  <div className="help-row" key={s.keys}>
                    <dt>
                      <kbd>{s.keys}</kbd>
                    </dt>
                    <dd>{s.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
