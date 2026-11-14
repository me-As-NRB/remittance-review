import { formatCents, parseCents } from '@/money/cents'
import { isDecided } from './rules'
import type { Batch, Line } from './types'

/**
 * R5: a batch is ready to post only when (a) it is Open, (b) no line is
 * Unmatched, and (c) paid over Matched, Suspense and Excluded lines adds up to
 * expectedAmount. Returns every reason that applies, in that order.
 */
export function readiness(batch: Batch, lines: Line[]): { ready: boolean; reasons: string[] } {
  const reasons: string[] = []

  if (batch.status !== 'Open') reasons.push('Batch is posted')

  const unmatched = lines.filter((line) => line.state === 'Unmatched').length
  if (unmatched > 0) reasons.push(`${unmatched} ${unmatched === 1 ? 'line' : 'lines'} unmatched`)

  const decidedCents = lines
    .filter((line) => isDecided(line.state))
    .reduce((sum, line) => sum + parseCents(line.paid), 0)
  const differenceCents = decidedCents - parseCents(batch.expectedAmount)
  if (differenceCents !== 0) reasons.push(`Totals differ by ${formatCents(Math.abs(differenceCents))}`)

  return { ready: reasons.length === 0, reasons }
}
