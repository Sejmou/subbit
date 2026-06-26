/** Focus a cue's text field after the store update and row mount have settled. */
export function focusCueForEdit(cueId: string) {
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent('subbit:edit', { detail: cueId }))
  })
}
