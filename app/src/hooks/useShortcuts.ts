import { useEffect } from 'react'
import { useProject } from '../store/project'
import { usePlayback } from '../store/playback'
import { frameDuration } from '../lib/timecode'

/**
 * Global keyboard handling with two modes:
 *  - navigation (no text field focused): single-key shortcuts
 *  - editing (a cue textarea focused): typing works; only modifier combos act
 */
function isEditing(target: EventTarget | null): target is HTMLTextAreaElement | HTMLInputElement {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
}

function activeCaret(): { cueId: string; segIndex: number; offset: number } | null {
  const el = document.activeElement as HTMLTextAreaElement | null
  if (!el || el.tagName !== 'TEXTAREA' || !el.dataset.cueId) return null
  return {
    cueId: el.dataset.cueId,
    segIndex: Number(el.dataset.segIndex ?? 0),
    offset: el.selectionStart ?? el.value.length,
  }
}

export function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ps = useProject.getState()
      const pb = usePlayback.getState()
      const editing = isEditing(e.target)

      // Help overlay toggles anywhere (even before a project is loaded),
      // except while typing in a text field.
      if (!editing && e.key === '?') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('subbit:help-toggle'))
        return
      }

      const project = ps.project
      if (!project) return
      const mod = e.metaKey || e.ctrlKey
      const cueId = ps.selectedCueId
      const cue = project.cues.find((c) => c.id === cueId)
      const frame = frameDuration(project.fps)

      // --- combos that work everywhere (including while editing text) ---
      if (mod && e.key === 's' && !e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('subbit:save'))
        return
      }
      if (mod && e.key === 'Enter') {
        const caret = activeCaret()
        if (caret) {
          e.preventDefault()
          ps.splitCueAtCaret(caret.cueId, caret.segIndex, caret.offset, pb.currentTime)
        }
        return
      }
      if (mod && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        const caret = activeCaret()
        if (caret) {
          e.preventDefault()
          ps.insertShotSplit(caret.cueId, caret.segIndex, caret.offset)
        }
        return
      }

      if (editing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }

      // --- navigation-mode single keys ---
      if (!cue) return
      const idx = project.cues.findIndex((c) => c.id === cue.id)

      switch (e.key) {
        case ' ':
          e.preventDefault()
          pb.togglePlay()
          return
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          ps.selectCue(project.cues[Math.min(idx + 1, project.cues.length - 1)].id)
          return
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          ps.selectCue(project.cues[Math.max(idx - 1, 0)].id)
          return
        case 'ArrowLeft':
          e.preventDefault()
          pb.seek(pb.currentTime - (e.shiftKey ? 1 : frame))
          return
        case 'ArrowRight':
          e.preventDefault()
          pb.seek(pb.currentTime + (e.shiftKey ? 1 : frame))
          return
        case 'i':
          ps.setCueStart(cue.id, pb.currentTime)
          return
        case 'o':
          ps.setCueEnd(cue.id, pb.currentTime)
          return
        case '[':
          ps.nudgeCueStart(cue.id, e.shiftKey ? frame : -frame)
          return
        case ']':
          ps.nudgeCueEnd(cue.id, e.shiftKey ? -frame : frame)
          return
        case 'm':
          ps.mergeWithNext(cue.id)
          return
        case 'r':
          ps.toggleReviewed(cue.id)
          return
        case 'Enter':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('subbit:edit', { detail: cue.id }))
          return
        case 'g':
          pb.seek(cue.start)
          return
      }

      // speaker quick-keys 1..9
      if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
        const speaker = project.speakers[Number(e.key) - 1]
        if (speaker) ps.setCueSpeaker(cue.id, speaker.id)
        return
      }
      // shot quick-keys: Shift+1..9 set the active segment's shot
      if (e.shiftKey && /^[!@#$%^&*(]$/.test(e.key)) {
        const map = '!@#$%^&*('
        const shot = project.shots[map.indexOf(e.key)]
        if (shot) ps.setSegmentShot(cue.id, ps.selectedSegment, shot.id)
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
