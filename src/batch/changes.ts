import { allocate } from '@/money/allocate'
import { formatCents, parseCents, toAmount } from '@/money/cents'
import type { Charge, Line, TargetState } from './types'

/** A change the user asked for on one line: match it to charges, or move it to a state. */
export type LineChange =
  | { kind: 'match'; charges: Pick<Charge, 'id' | 'amount'>[] }
  | { kind: 'state'; state: TargetState; reason?: string }

/**
 * The line as the server will return it after `change`, minus the version bump.
 * Used to update the row immediately (optimistic update); the server's answer
 * then replaces it.
 */
export function optimisticLine(line: Line, change: LineChange): Line {
  if (change.kind === 'match') {
    const shares = allocate(
      parseCents(line.paid),
      change.charges.map((charge) => ({ id: charge.id, amountCents: parseCents(charge.amount) })),
    )
    return {
      ...withoutReason(line),
      state: 'Matched',
      allocations: shares.map((share) => ({ chargeId: share.chargeId, amount: toAmount(share.amountCents) })),
    }
  }
  return {
    ...withoutReason(line),
    state: change.state,
    allocations: [],
    ...(change.reason && change.state !== 'Unmatched' ? { reason: change.reason } : {}),
  }
}

/** "Match to CH-41 and CH-42", "Send to suspense", "Exclude (reason: …)", "Unmatch". */
export function describeChange(change: LineChange): string {
  if (change.kind === 'match') return `Match to ${joinIds(change.charges.map((charge) => charge.id))}`
  switch (change.state) {
    case 'Suspense':
      return 'Send to suspense'
    case 'Excluded':
      return `Exclude (reason: ${change.reason ?? 'none'})`
    case 'Unmatched':
      return 'Unmatch'
  }
}

/** "Matched to CH-41 $100.00 and CH-42 $100.00", "Suspense", "Excluded (reason: …)". */
export function describeLine(line: Line): string {
  if (line.state === 'Matched') {
    return `Matched to ${joinIds(line.allocations.map((a) => `${a.chargeId} ${formatCents(parseCents(a.amount))}`))}`
  }
  return line.reason ? `${line.state} (reason: ${line.reason})` : line.state
}

export function withoutReason(line: Line): Line {
  const copy = { ...line }
  delete copy.reason
  return copy
}

function joinIds(ids: string[]): string {
  if (ids.length <= 1) return ids.join('')
  return `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`
}
