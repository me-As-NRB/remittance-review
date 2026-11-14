import { parseCents } from '@/money/cents'
import { LINE_STATES, type Line, type LineState } from './types'

type Amounts = Pick<Line, 'billed' | 'paid' | 'adjustments'>

/** R1: a line is valid only if billed = paid + adjustments. */
export function isValidLine(line: Amounts): boolean {
  return validityGapCents(line) === 0
}

/** How far billed is from paid + adjustments, in cents (0 for a valid line). */
export function validityGapCents(line: Amounts): number {
  return parseCents(line.billed) - (parseCents(line.paid) + parseCents(line.adjustments))
}

/** Sum of paid per state, in integer cents. */
export function totalsByState(lines: readonly Line[]): Record<LineState, number> {
  const totals = Object.fromEntries(LINE_STATES.map((state) => [state, 0])) as Record<LineState, number>
  for (const line of lines) totals[line.state] += parseCents(line.paid)
  return totals
}

/** Lines in any state except Unmatched count towards the batch total (R5c). */
export function isDecided(state: LineState): boolean {
  return state !== 'Unmatched'
}
