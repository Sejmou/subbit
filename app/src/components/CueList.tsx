import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Project } from '../types'
import { useProject } from '../store/project'
import { usePlayback } from '../store/playback'
import { findActiveCueIndex } from '../lib/active-cue'
import { cueMatchesListFilters, hasActiveFilters, type ReviewStatusFilter } from '../lib/cue-filters'
import { shortcutLabel } from '../lib/shortcuts'
import { focusCueForEdit, type FocusCueDetail } from '../lib/focus-cue'
import { CueRow } from './CueRow'

interface Props {
  project: Project
  speakerFilter?: string[]
  statusFilter?: ReviewStatusFilter[]
}

export function CueList({ project, speakerFilter = [], statusFilter = [] }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const selectedCueId = useProject((s) => s.selectedCueId)
  const insertCueAtPlayhead = useProject((s) => s.insertCueAtPlayhead)
  const currentTime = usePlayback((s) => s.currentTime)
  const [activeIndex, setActiveIndex] = useState(-1)
  const isEmpty = project.cues.length === 0

  const entries = useMemo(() => {
    const all = project.cues.map((cue, index) => ({ cue, index }))
    if (!hasActiveFilters(speakerFilter, statusFilter)) return all
    return all.filter(({ cue }) => cueMatchesListFilters(cue, speakerFilter, statusFilter))
  }, [project.cues, speakerFilter, statusFilter])

  const filterActive = hasActiveFilters(speakerFilter, statusFilter)
  const filteredEmpty = filterActive && entries.length === 0

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
  })

  // Track the active cue from the playhead without re-rendering every frame.
  useEffect(() => {
    if (isEmpty) return
    let last = -1
    return usePlayback.subscribe((state) => {
      const idx = findActiveCueIndex(project.cues, state.currentTime)
      if (idx !== last) {
        last = idx
        setActiveIndex(idx)
      }
    })
  }, [project.cues, isEmpty])

  // Keep the selected cue visible during keyboard navigation.
  useEffect(() => {
    if (isEmpty || filteredEmpty) return
    const idx = entries.findIndex(({ cue }) => cue.id === selectedCueId)
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' })
  }, [selectedCueId, entries, virtualizer, isEmpty, filteredEmpty])

  // Scroll (optional align) then focus — used by timeline double-click, shortcuts, etc.
  useEffect(() => {
    if (isEmpty || filteredEmpty) return

    function onFocusCue(e: Event) {
      const { cueId, scroll } = (e as CustomEvent<FocusCueDetail>).detail
      const idx = entries.findIndex(({ cue }) => cue.id === cueId)
      if (idx < 0) return

      virtualizer.scrollToIndex(idx, { align: scroll })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('subbit:edit', { detail: cueId }))
        })
      })
    }

    window.addEventListener('subbit:focus-cue', onFocusCue)
    return () => window.removeEventListener('subbit:focus-cue', onFocusCue)
  }, [entries, virtualizer, isEmpty, filteredEmpty])

  if (isEmpty) {
    return (
      <div className="cue-list cue-list--empty">
        <p>No subtitles yet.</p>
        <p className="hint">
          Press <kbd>{shortcutLabel('insert-cue')}</kbd> to add a cue at the playhead, or use{' '}
          <strong>File → Import whisperx…</strong>
        </p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const id = insertCueAtPlayhead(currentTime)
            if (id) focusCueForEdit(id)
          }}
        >
          Add cue at playhead
        </button>
      </div>
    )
  }

  if (filteredEmpty) {
    return (
      <div className="cue-list cue-list--empty">
        <p>No cues match the current filters.</p>
        <p className="hint">Use the Filters menu in the toolbar or click Reset to show all cues.</p>
      </div>
    )
  }

  const items = virtualizer.getVirtualItems()

  return (
    <div className="cue-list" ref={parentRef}>
      {filterActive && (
        <div className="cue-list-filter-bar">
          Showing {entries.length} of {project.cues.length} cues
        </div>
      )}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {items.map((item) => {
          const { cue, index } = entries[item.index]
          return (
            <div
              key={cue.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <CueRow
                cue={cue}
                index={index}
                project={project}
                selected={cue.id === selectedCueId}
                active={index === activeIndex}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
