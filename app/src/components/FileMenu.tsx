import { useEffect, useRef, useState } from 'react'

interface Props {
  onOpenProject: () => void
  onNewFromWhisperx: () => void
  onCloseProject: () => void
}

export function FileMenu({ onOpenProject, onNewFromWhisperx, onCloseProject }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <div className="file-menu" ref={rootRef}>
      <button type="button" className="file-menu-trigger" onClick={() => setOpen((v) => !v)}>
        File ▾
      </button>
      {open && (
        <div className="file-menu-dropdown" role="menu">
          <button type="button" role="menuitem" onClick={() => run(onOpenProject)}>
            Open project…
          </button>
          <button type="button" role="menuitem" onClick={() => run(onNewFromWhisperx)}>
            New from whisperx…
          </button>
          <hr />
          <button type="button" role="menuitem" onClick={() => run(onCloseProject)}>
            Close project
          </button>
        </div>
      )}
    </div>
  )
}
