import type { Speaker } from '../types'

export const NO_ROLE_LABEL = '— Role —'

export interface RoleOption {
  id: string | null
  name: string
  color?: string
}

let rolePickerOpen = false

export function isRolePickerOpen(): boolean {
  return rolePickerOpen
}

export function setRolePickerOpen(open: boolean): void {
  rolePickerOpen = open
}

export function openRolePicker(cueId?: string): void {
  window.dispatchEvent(
    new CustomEvent('subbit:role-picker-open', { detail: cueId ? { cueId } : undefined }),
  )
}

export function filterRoleOptions(speakers: Speaker[], query: string): RoleOption[] {
  const q = query.trim().toLowerCase()
  const roles: RoleOption[] = speakers.map((s) => ({
    id: s.id,
    name: s.name.trim() || 'Unnamed role',
    color: s.color,
  }))
  const none: RoleOption = { id: null, name: NO_ROLE_LABEL }

  if (!q) return [none, ...roles]

  const matched = roles.filter((r) => r.name.toLowerCase().includes(q))
  const noneMatches =
    NO_ROLE_LABEL.toLowerCase().includes(q) ||
    'no role'.includes(q) ||
    'role'.includes(q) ||
    'none'.includes(q) ||
    'clear'.includes(q)

  return noneMatches ? [none, ...matched] : matched
}
