/**
 * Shapes exactly as the API sends them (spec 2.2). Amounts stay strings here;
 * code converts them with parseCents before doing any arithmetic.
 */

/** An amount as the API sends it: a string with exactly two decimals, e.g. "120.00". */
export type Amount = string

export const LINE_STATES = ['Unmatched', 'Matched', 'Suspense', 'Excluded'] as const
export type LineState = (typeof LINE_STATES)[number]

/** States a line can be moved to with PUT /lines/{id}/state (Matched only comes from /match). */
export type TargetState = Exclude<LineState, 'Matched'>

export type BatchStatus = 'Open' | 'Posted'

export interface Charge {
  id: string
  labId: string
  claimId: string
  code: string
  dateOfService: string
  amount: Amount
}

export interface Batch {
  id: string
  labId: string
  expectedAmount: Amount
  status: BatchStatus
}

export interface Allocation {
  chargeId: string
  amount: Amount
}

export interface Line {
  id: string
  batchId: string
  claimId: string
  code: string
  originalCode?: string
  dateOfService: string
  billed: Amount
  paid: Amount
  adjustments: Amount
  state: LineState
  allocations: Allocation[]
  reason?: string
  /** Free text from the insurer. Untrusted: always render it as plain text. */
  remark?: string
  version: number
}

/** GET /batches/{id}: the batch plus the server's totals per state and canPost (R5). */
export interface BatchSummary extends Batch {
  totals: Record<LineState, Amount>
  canPost: boolean
}
