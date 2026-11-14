import type { Problem, ProblemCode } from '@/api/problem'
import { withoutReason } from '@/batch/changes'
import { readiness } from '@/batch/readiness'
import { isValidLine, totalsByState } from '@/batch/rules'
import { LINE_STATES, type Batch, type Charge, type Line, type TargetState } from '@/batch/types'
import { allocate } from '@/money/allocate'
import { parseCents, toAmount } from '@/money/cents'
import { CALLER_LAB, createSeed, type SeedData } from './seed'

/** What a mock endpoint answers: an HTTP status and a JSON body. */
export interface MockResponse {
  status: number
  body: unknown
}

const TARGET_STATES: readonly TargetState[] = ['Unmatched', 'Suspense', 'Excluded']
const MAX_REASON_LENGTH = 200
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const INVALID_LINE_MESSAGE =
  'This line is invalid (billed is not paid + adjustments), so it can only be excluded.'

/**
 * The mock server's data and rules, as plain functions so they can be tested
 * without HTTP. It enforces R1, R4, R6 and R8 and answers errors in the R10
 * shape. Checks run in R9 order: 404, then 409 batch posted, then 409 stale
 * version, then 422.
 */
export function createMockDb(seed: () => SeedData = createSeed) {
  let data = seed()

  const batchOf = (line: Line) => data.batches.find((b) => b.id === line.batchId)
  const findBatch = (id: string) => data.batches.find((b) => b.id === id && b.labId === CALLER_LAB)
  const linesOf = (batchId: string) => data.lines.filter((line) => line.batchId === batchId)
  const findLine = (id: string) => {
    const line = data.lines.find((l) => l.id === id)
    return line && batchOf(line)?.labId === CALLER_LAB ? line : undefined
  }
  const save = (updated: Line): MockResponse => {
    data.lines = data.lines.map((line) => (line.id === updated.id ? updated : line))
    return { status: 200, body: updated }
  }

  /** The checks every write shares, in R9 order. Returns the line, or the error to send. */
  function guardWrite(lineId: string, body: unknown): { line: Line; body: Record<string, unknown> } | MockResponse {
    const line = findLine(lineId)
    if (!line) return problem(404, 'not_found', `Line ${lineId} was not found`)
    if (batchOf(line)?.status === 'Posted') {
      return problem(409, 'batch_posted', 'This batch is posted and can no longer be changed')
    }
    if (!isRecord(body)) return validation({ body: ['Send a JSON object'] })
    if (!Number.isSafeInteger(body.version)) return validation({ version: ['Send the version you last read'] })
    if (body.version !== line.version) {
      return problem(409, 'stale_version', 'This line was changed by someone else', { current: line })
    }
    return { line, body }
  }

  return {
    getBatch(id: string): MockResponse {
      const batch = findBatch(id)
      if (!batch) return problem(404, 'not_found', `Batch ${id} was not found`)
      const lines = linesOf(batch.id)
      const totals = totalsByState(lines)
      return {
        status: 200,
        body: {
          ...batch,
          totals: Object.fromEntries(LINE_STATES.map((state) => [state, toAmount(totals[state])])),
          canPost: readiness(batch, lines).ready,
        },
      }
    },

    getLines(batchId: string): MockResponse {
      if (!findBatch(batchId)) return problem(404, 'not_found', `Batch ${batchId} was not found`)
      const lines = [...linesOf(batchId)].sort(
        (a, b) => compare(a.dateOfService, b.dateOfService) || compare(a.id, b.id),
      )
      return { status: 200, body: lines }
    },

    searchCharges(q: string | null, limit: string | null): MockResponse {
      const query = (q ?? '').trim().toLowerCase()
      if (!query) return validation({ q: ['Enter at least one character to search'] })
      const max = limit === null ? DEFAULT_LIMIT : Number.parseInt(limit, 10)
      if (!/^\d+$/.test(limit ?? '20') || max < 1 || max > MAX_LIMIT) {
        return validation({ limit: [`Use a whole number from 1 to ${MAX_LIMIT}`] })
      }
      const matches = data.charges
        .filter((c) => c.labId === CALLER_LAB)
        .filter((c) => c.claimId.toLowerCase().startsWith(query) || c.code.toLowerCase().startsWith(query))
        .sort((a, b) => compare(a.claimId, b.claimId) || compare(a.id, b.id))
      return { status: 200, body: matches.slice(0, max) }
    },

    matchLine(lineId: string, requestBody: unknown): MockResponse {
      const guarded = guardWrite(lineId, requestBody)
      if ('status' in guarded) return guarded
      const { line, body } = guarded

      const errors: Record<string, string[]> = {}
      if (!isValidLine(line)) errors.line = [INVALID_LINE_MESSAGE]
      const chargeIds = body.chargeIds
      const charges: Charge[] = []
      if (!Array.isArray(chargeIds) || chargeIds.length === 0 || !chargeIds.every((id) => typeof id === 'string')) {
        errors.chargeIds = ['Pick at least one charge']
      } else if (new Set(chargeIds).size !== chargeIds.length) {
        errors.chargeIds = ['Each charge can only be picked once']
      } else {
        for (const id of chargeIds) {
          const charge = data.charges.find((c) => c.id === id && c.labId === CALLER_LAB)
          if (!charge) (errors.chargeIds ??= []).push(`Charge ${id} was not found`)
          else if (charge.claimId !== line.claimId) {
            (errors.chargeIds ??= []).push(`Charge ${id} is on claim ${charge.claimId}, not ${line.claimId}`)
          } else charges.push(charge)
        }
      }
      if (Object.keys(errors).length > 0) return validation(errors)

      const shares = allocate(
        parseCents(line.paid),
        charges.map((charge) => ({ id: charge.id, amountCents: parseCents(charge.amount) })),
      )
      return save({
        ...withoutReason(line),
        state: 'Matched',
        allocations: shares.map((share) => ({ chargeId: share.chargeId, amount: toAmount(share.amountCents) })),
        version: line.version + 1,
      })
    },

    setLineState(lineId: string, requestBody: unknown): MockResponse {
      const guarded = guardWrite(lineId, requestBody)
      if ('status' in guarded) return guarded
      const { line, body } = guarded

      const errors: Record<string, string[]> = {}
      const state = TARGET_STATES.find((s) => s === body.state)
      if (!state) errors.state = ['Use Unmatched, Suspense or Excluded (match a line with PUT /lines/{id}/match)']
      else if (state !== 'Excluded' && !isValidLine(line)) errors.state = [INVALID_LINE_MESSAGE]

      const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined
      if (body.reason !== undefined && typeof body.reason !== 'string') errors.reason = ['Reason must be text']
      else if (state === 'Excluded' && !reason) errors.reason = ['Enter a reason for excluding this line']
      else if (reason && reason.length > MAX_REASON_LENGTH) {
        errors.reason = [`Keep the reason to ${MAX_REASON_LENGTH} characters or fewer`]
      }
      if (!state || Object.keys(errors).length > 0) return validation(errors)

      return save({
        ...withoutReason(line),
        state,
        allocations: [],
        ...(reason && state !== 'Unmatched' ? { reason } : {}),
        version: line.version + 1,
      })
    },

    /** Dev tool: another user changes a line, so your next write on it gets a 409. */
    simulateOtherUser(lineId: string): Line | undefined {
      const line = findLine(lineId)
      if (!line || batchOf(line)?.status === 'Posted') return undefined
      const rest = withoutReason(line)
      const next: Line = !isValidLine(line)
        ? { ...rest, state: 'Excluded', allocations: [], reason: 'Excluded by another user' }
        : line.state === 'Suspense'
          ? { ...rest, state: 'Unmatched', allocations: [] }
          : { ...rest, state: 'Suspense', allocations: [], reason: 'Sent to suspense by another user' }
      save({ ...next, version: line.version + 1 })
      return next
    },

    /** Dev tool: another user posts the batch, so your next write gets a 409 batch_posted. */
    simulatePosting(batchId: string): Batch | undefined {
      const batch = findBatch(batchId)
      if (!batch) return undefined
      const posted: Batch = { ...batch, status: 'Posted' }
      data.batches = data.batches.map((b) => (b.id === batchId ? posted : b))
      return posted
    },

    reset(): void {
      data = seed()
    },
  }
}

export type MockDb = ReturnType<typeof createMockDb>

export function problem(
  status: number,
  code: ProblemCode,
  title: string,
  extra: Pick<Problem, 'current' | 'errors'> = {},
): MockResponse {
  const body: Problem = { type: `/problems/${code.replace('_', '-')}`, title, status, code, ...extra }
  return { status, body }
}

export function validation(errors: Record<string, string[]>): MockResponse {
  return problem(422, 'validation', 'The request has invalid fields', { errors })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Ordinal string compare, so ordering never depends on locale. */
function compare(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
