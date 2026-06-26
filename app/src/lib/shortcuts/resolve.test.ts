import { describe, expect, it, vi } from 'vitest'
import type { Cue, Project } from '../../types'
import type { ShortcutContext } from './context'
import { shortcutGroups } from './groups'
import { SHORTCUTS } from './registry'
import { resolveShortcut } from './resolve'

function makeKeyEvent(
  keyVal: string,
  init: Partial<Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>> = {},
): KeyboardEvent {
  return {
    key: keyVal,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...init,
  } as KeyboardEvent
}

function modKey(
  keyVal: string,
  init: Partial<Pick<KeyboardEvent, 'shiftKey'>> = {},
) {
  return makeKeyEvent(keyVal, { metaKey: true, ...init })
}

const cue: Cue = {
  id: 'cue-1',
  start: 1,
  end: 5,
  speakerId: 'SPEAKER_00',
  segments: [{ text: 'hello', shot: 'ON' }],
}

const project: Project = {
  version: 1,
  videoName: 'test',
  fps: 25,
  timecodeOffset: '10:00:00:00',
  defaultShot: 'ON',
  shots: [{ id: 'ON', label: 'On-screen' }],
  speakers: [{ id: 'SPEAKER_00', name: 'A', color: '#fff' }],
  cues: [cue],
}

function ctx(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
  const ps = {
    undo: vi.fn(),
    redo: vi.fn(),
    selectCue: vi.fn(),
    setCueStart: vi.fn(),
    setCueEnd: vi.fn(),
    nudgeCueStart: vi.fn(),
    nudgeCueEnd: vi.fn(),
    mergeWithNext: vi.fn(),
    splitAtMergedSegment: vi.fn(),
    toggleReviewed: vi.fn(),
    setCueSpeaker: vi.fn(),
    setSegmentShot: vi.fn(),
    splitCueAtCaret: vi.fn(),
    insertShotSplit: vi.fn(),
    selectedSegment: 0,
  }
  const pb = {
    togglePlay: vi.fn(),
    seek: vi.fn(),
    currentTime: 2,
  }
  return {
    editing: false,
    target: null,
    project,
    cue,
    cueIndex: 0,
    frame: 0.04,
    caret: null,
    ps: ps as unknown as ShortcutContext['ps'],
    pb: pb as unknown as ShortcutContext['pb'],
    ...overrides,
  }
}

describe('shortcut registry', () => {
  it('defines label and handlers for every shortcut', () => {
    for (const def of SHORTCUTS) {
      expect(def.id).toBeTruthy()
      expect(def.group).toBeTruthy()
      expect(def.description).toBeTruthy()
      expect(def.match).toBeTypeOf('function')
      expect(def.run).toBeTypeOf('function')
      const label = typeof def.label === 'function' ? def.label('Cmd') : def.label
      expect(label).toBeTruthy()
    }
  })

  it('documents each help-visible shortcut exactly once', () => {
    const helpIds = SHORTCUTS.filter((s) => s.showInHelp !== false).map((s) => s.id)
    expect(new Set(helpIds).size).toBe(helpIds.length)

    const groups = shortcutGroups('Cmd')
    const documented = groups.flatMap((g) => g.shortcuts.map((s) => s.description))
    const expected = SHORTCUTS.filter((s) => s.showInHelp !== false).map((s) => s.description)
    expect(documented.sort()).toEqual(expected.sort())
  })
})

describe('resolveShortcut', () => {
  it('toggles help outside a text field', () => {
    expect(resolveShortcut(makeKeyEvent('?'), ctx())?.id).toBe('help-toggle')
    expect(resolveShortcut(makeKeyEvent('?'), ctx({ editing: true }))).toBeNull()
  })

  it('requires a loaded project for editing shortcuts', () => {
    expect(resolveShortcut(modKey('z'), ctx({ project: null }))).toBeNull()
    expect(resolveShortcut(modKey('z'), ctx())?.id).toBe('undo')
  })

  it('maps redo to shift+z and y', () => {
    expect(resolveShortcut(modKey('z', { shiftKey: true }), ctx())?.id).toBe('redo')
    expect(resolveShortcut(modKey('y'), ctx())?.id).toBe('redo')
  })

  it('handles navigation bindings when a cue is selected', () => {
    const c = ctx()
    resolveShortcut(makeKeyEvent(' '), c)?.run(c, makeKeyEvent(' '))
    expect(c.pb.togglePlay).toHaveBeenCalled()

    expect(resolveShortcut(makeKeyEvent('j'), ctx())?.id).toBe('next-cue')
    expect(resolveShortcut(makeKeyEvent('k'), ctx())?.id).toBe('previous-cue')
    expect(resolveShortcut(makeKeyEvent('ArrowLeft'), ctx())?.id).toBe('jog-back')
    expect(resolveShortcut(makeKeyEvent('ArrowRight', { shiftKey: true }), ctx())?.id).toBe(
      'jog-forward-second',
    )
  })

  it('ignores navigation shortcuts while editing text', () => {
    expect(resolveShortcut(makeKeyEvent(' '), ctx({ editing: true }))).toBeNull()
    expect(resolveShortcut(modKey('z'), ctx({ editing: true }))?.id).toBe('undo')
    expect(resolveShortcut(makeKeyEvent('Escape'), ctx({ editing: true }))?.id).toBe('leave-text')
  })

  it('requires a caret for split and shot-insert combos', () => {
    expect(resolveShortcut(modKey('Enter'), ctx({ caret: null }))).toBeNull()
    const caret = { cueId: 'cue-1', segIndex: 0, offset: 3 }
    expect(resolveShortcut(modKey('Enter'), ctx({ caret }))?.id).toBe('split-at-caret')
    expect(resolveShortcut(modKey('s', { shiftKey: true }), ctx({ caret }))?.id).toBe(
      'insert-shot-split',
    )
  })

  it('ignores browser modifier combos for single-key bindings', () => {
    expect(resolveShortcut(modKey('r'), ctx())).toBeNull()
    expect(resolveShortcut(modKey('s'), ctx())?.id).toBe('save')
    expect(resolveShortcut(makeKeyEvent('r'), ctx())?.id).toBe('toggle-reviewed')
  })

  it('assigns speaker and shot from number keys', () => {
    const c = ctx()
    resolveShortcut(makeKeyEvent('1'), c)?.run(c, makeKeyEvent('1'))
    expect(c.ps.setCueSpeaker).toHaveBeenCalledWith('cue-1', 'SPEAKER_00')

    const c2 = ctx()
    const shotKey = makeKeyEvent('!', { shiftKey: true })
    resolveShortcut(shotKey, c2)?.run(c2, shotKey)
    expect(c2.ps.setSegmentShot).toHaveBeenCalledWith('cue-1', 0, 'ON')
  })
})
