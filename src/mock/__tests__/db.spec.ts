import { beforeEach, describe, expect, it } from 'vitest'
import type { Problem } from '@/api/problem'
import type { BatchSummary, Charge, Line } from '@/batch/types'
import { createMockDb, type MockDb } from '../db'

let db: MockDb
beforeEach(() => {
  db = createMockDb()
})

const lineOf = (id: string): Line => {
  const lines = db.getLines('B-104').body as Line[]
  const line = lines.find((l) => l.id === id)
  if (!line) throw new Error(`no line ${id}`)
  return line
}
const asProblem = (body: unknown) => body as Problem

describe('GET /batches/{id}', () => {
  it('returns the batch with totals per state and canPost', () => {
    const { status, body } = db.getBatch('B-104')
    expect(status).toBe(200)
    expect(body).toEqual({
      id: 'B-104',
      labId: 'LAB-A',
      expectedAmount: '505.00',
      status: 'Open',
      totals: { Unmatched: '275.00', Matched: '230.00', Suspense: '0.00', Excluded: '0.00' },
      canPost: false,
    })
  })

  it('turns canPost on once every line is decided and the totals match', () => {
    db.matchLine('L-6', { version: 1, chargeIds: ['CH-41', 'CH-42'] })
    db.setLineState('L-7', { version: 1, state: 'Suspense' })
    db.setLineState('L-9', { version: 1, state: 'Excluded', reason: 'Billed amount does not reconcile' })
    expect((db.getBatch('B-104').body as BatchSummary).canPost).toBe(true)
  })

  it('never lets a posted batch post', () => {
    expect((db.getBatch('B-099').body as BatchSummary).canPost).toBe(false)
  })

  it('answers 404 in the R10 shape for an unknown batch', () => {
    expect(db.getBatch('B-404')).toEqual({
      status: 404,
      body: { type: '/problems/not-found', title: 'Batch B-404 was not found', status: 404, code: 'not_found' },
    })
  })
})

describe('GET /batches/{id}/lines', () => {
  it('orders lines by date of service, then id', () => {
    const ids = (db.getLines('B-104').body as Line[]).map((l) => l.id)
    expect(ids).toEqual(['L-1', 'L-2', 'L-3', 'L-4', 'L-5', 'L-6', 'L-7', 'L-8', 'L-9'])
    const large = (db.getLines('B-500').body as Line[]).map((l) => `${l.dateOfService} ${l.id}`)
    expect(large).toEqual([...large].sort())
  })
})

describe('GET /charges', () => {
  const ids = (q: string | null, limit: string | null = null) =>
    (db.searchCharges(q, limit).body as Charge[]).map((c) => c.id)

  it('finds charges whose claim or code starts with q, ignoring case, ordered by claim then id', () => {
    expect(ids('c-50')).toEqual(['CH-11', 'CH-12', 'CH-21', 'CH-31', 'CH-41', 'CH-42', 'CH-51', 'CH-61'])
    const byCode = db.searchCharges('8834', '50').body as Charge[]
    expect(byCode[0]?.id).toBe('CH-12')
    expect(byCode.every((c) => c.code.startsWith('8834'))).toBe(true)
  })

  it('only returns charges of the caller lab', () => {
    expect(ids('C-501')).toEqual(['CH-11', 'CH-12'])
  })

  it('uses a default limit of 20 and accepts up to 50', () => {
    expect(ids('C-7')).toHaveLength(20)
    expect(ids('C-7', '50')).toHaveLength(50)
  })

  it.each([
    ['empty q', '', null, 'q'],
    ['blank q', '   ', null, 'q'],
    ['missing q', null, null, 'q'],
    ['limit above 50', 'C', '51', 'limit'],
    ['limit of zero', 'C', '0', 'limit'],
    ['non-numeric limit', 'C', 'ten', 'limit'],
  ])('answers 422 for %s', (_name, q, limit, field) => {
    const { status, body } = db.searchCharges(q, limit)
    expect(status).toBe(422)
    expect(asProblem(body).code).toBe('validation')
    expect(asProblem(body).errors).toHaveProperty(field)
  })
})

describe('PUT /lines/{id}/match', () => {
  it('splits L-6 across CH-41 and CH-42 (R4) and bumps the version', () => {
    const { status, body } = db.matchLine('L-6', { version: 1, chargeIds: ['CH-41', 'CH-42'] })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      id: 'L-6',
      state: 'Matched',
      version: 2,
      allocations: [
        { chargeId: 'CH-41', amount: '100.00' },
        { chargeId: 'CH-42', amount: '100.00' },
      ],
    })
  })

  it('gives a simple match one allocation for the full paid amount', () => {
    const { body } = db.matchLine('L-6', { version: 1, chargeIds: ['CH-42'] })
    expect((body as Line).allocations).toEqual([{ chargeId: 'CH-42', amount: '200.00' }])
  })

  it('refuses to match an invalid line (R1)', () => {
    const { status, body } = db.matchLine('L-9', { version: 1, chargeIds: ['CH-61'] })
    expect(status).toBe(422)
    expect(asProblem(body).errors?.line).toEqual([expect.stringContaining('can only be excluded')])
  })

  it.each([
    ['no charges', [], 'Pick at least one charge'],
    ['a duplicate charge', ['CH-41', 'CH-41'], 'Each charge can only be picked once'],
    ['a charge on another claim', ['CH-41', 'CH-11'], 'Charge CH-11 is on claim C-501, not C-504'],
    ['a charge of another lab', ['CH-B11'], 'Charge CH-B11 was not found'],
    ['an unknown charge', ['CH-00'], 'Charge CH-00 was not found'],
  ])('answers 422 for %s (R4)', (_name, chargeIds, message) => {
    const { status, body } = db.matchLine('L-6', { version: 1, chargeIds })
    expect(status).toBe(422)
    expect(asProblem(body)).toMatchObject({ code: 'validation', errors: { chargeIds: [message] } })
    expect(lineOf('L-6').version).toBe(1)
  })

  it('answers 409 stale_version with the current line when the version is old (R6)', () => {
    db.setLineState('L-6', { version: 1, state: 'Suspense' })
    const { status, body } = db.matchLine('L-6', { version: 1, chargeIds: ['CH-41'] })
    expect(status).toBe(409)
    expect(asProblem(body)).toMatchObject({ code: 'stale_version', title: expect.any(String), type: expect.any(String) })
    expect(asProblem(body).current).toEqual(lineOf('L-6'))
    expect(asProblem(body).current).toMatchObject({ state: 'Suspense', version: 2 })
  })

  it('answers 409 batch_posted for a line of a posted batch (R8)', () => {
    const { status, body } = db.matchLine('P-2', { version: 2, chargeIds: ['CH-91'] })
    expect(status).toBe(409)
    expect(asProblem(body).code).toBe('batch_posted')
  })

  it('checks in R9 order: posted before stale, stale before validation', () => {
    expect(asProblem(db.matchLine('P-2', { version: 99, chargeIds: [] }).body).code).toBe('batch_posted')
    expect(asProblem(db.matchLine('L-9', { version: 99, chargeIds: [] }).body).code).toBe('stale_version')
    expect(asProblem(db.matchLine('L-999', { version: 1, chargeIds: [] }).body).code).toBe('not_found')
  })

  it('answers 422 when the version is missing', () => {
    expect(db.matchLine('L-6', { chargeIds: ['CH-41'] }).status).toBe(422)
  })
})

describe('PUT /lines/{id}/state', () => {
  it('sends a line to suspense and clears its allocations', () => {
    const { status, body } = db.setLineState('L-1', { version: 1, state: 'Suspense', reason: 'Checking with payer' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ state: 'Suspense', allocations: [], reason: 'Checking with payer', version: 2 })
  })

  it('moves a matched line back to Unmatched without a reason', () => {
    const { body } = db.setLineState('L-1', { version: 1, state: 'Unmatched' })
    expect(body).toMatchObject({ state: 'Unmatched', allocations: [], version: 2 })
    expect(body).not.toHaveProperty('reason')
  })

  it('excludes an invalid line, which is the only move it allows (R1)', () => {
    expect(db.setLineState('L-9', { version: 1, state: 'Excluded', reason: 'Does not reconcile' }).status).toBe(200)
  })

  it.each(['Suspense', 'Unmatched'])('refuses to move an invalid line to %s (R1)', (state) => {
    const { status, body } = db.setLineState('L-9', { version: 1, state })
    expect(status).toBe(422)
    expect(asProblem(body).errors?.state).toEqual([expect.stringContaining('can only be excluded')])
  })

  it.each([
    ['a missing reason', undefined],
    ['a blank reason', '   '],
    ['a reason over 200 characters', 'x'.repeat(201)],
  ])('refuses to exclude with %s', (_name, reason) => {
    const { status, body } = db.setLineState('L-7', { version: 1, state: 'Excluded', reason })
    expect(status).toBe(422)
    expect(asProblem(body).errors).toHaveProperty('reason')
  })

  it('accepts a reason of exactly 200 characters', () => {
    expect(db.setLineState('L-7', { version: 1, state: 'Excluded', reason: 'x'.repeat(200) }).status).toBe(200)
  })

  it('refuses Matched, which only /match can set', () => {
    expect(db.setLineState('L-6', { version: 1, state: 'Matched' }).status).toBe(422)
  })

  it('answers 409 batch_posted for a posted batch (R8)', () => {
    expect(asProblem(db.setLineState('P-1', { version: 1, state: 'Suspense' }).body).code).toBe('batch_posted')
  })

  it.each([
    ['a string', 'hello'],
    ['an array', [1, 2]],
    ['null', null],
  ])('answers 422 when the body is %s', (_name, body) => {
    expect(db.setLineState('L-1', body).status).toBe(422)
  })
})

describe('dev tools', () => {
  it('simulateOtherUser changes a line so the next write is stale', () => {
    db.simulateOtherUser('L-6')
    expect(asProblem(db.matchLine('L-6', { version: 1, chargeIds: ['CH-41'] }).body).code).toBe('stale_version')
  })

  it('simulatePosting makes the next write answer batch_posted', () => {
    db.simulatePosting('B-104')
    expect(asProblem(db.setLineState('L-7', { version: 1, state: 'Suspense' }).body).code).toBe('batch_posted')
  })

  it('reset brings back the seed', () => {
    db.setLineState('L-7', { version: 1, state: 'Suspense' })
    db.reset()
    expect(lineOf('L-7')).toMatchObject({ state: 'Unmatched', version: 1 })
  })
})
