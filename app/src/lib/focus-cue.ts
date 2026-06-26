export type FocusCueScroll = 'auto' | 'start' | 'center' | 'end'

export interface FocusCueDetail {
  cueId: string
  scroll: FocusCueScroll
}

/** Focus a cue's text field after the list scroll and row mount have settled. */
export function focusCueForEdit(cueId: string, options?: { scroll?: FocusCueScroll }) {
  const detail: FocusCueDetail = { cueId, scroll: options?.scroll ?? 'auto' }
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent('subbit:focus-cue', { detail }))
  })
}
