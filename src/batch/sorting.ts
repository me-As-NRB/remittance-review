import { parseCents } from '@/money/cents'
import type { Line, LineState } from './types'

export type StateFilter = LineState | 'All'
export type SortKey = 'date-asc' | 'date-desc' | 'paid-asc' | 'paid-desc'

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date-asc', label: 'Date of service, oldest first' },
  { key: 'date-desc', label: 'Date of service, newest first' },
  { key: 'paid-asc', label: 'Paid, lowest first' },
  { key: 'paid-desc', label: 'Paid, highest first' },
]

export function filterLines(lines: readonly Line[], state: StateFilter): Line[] {
  return state === 'All' ? [...lines] : lines.filter((line) => line.state === state)
}

/** Sorts a copy. Ties fall back to the line id, so the order is always the same. */
export function sortLines(lines: readonly Line[], key: SortKey): Line[] {
  const direction = key.endsWith('desc') ? -1 : 1
  const byField =
    key.startsWith('paid')
      ? (a: Line, b: Line) => parseCents(a.paid) - parseCents(b.paid)
      : (a: Line, b: Line) => compare(a.dateOfService, b.dateOfService)
  return [...lines].sort((a, b) => direction * byField(a, b) || compare(a.id, b.id))
}

function compare(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
