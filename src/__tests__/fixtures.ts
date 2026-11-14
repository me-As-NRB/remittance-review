import type { Batch, Charge, Line } from '@/batch/types'

/** Test data builders with sensible defaults; override only what a test cares about. */
export function makeLine(overrides: Partial<Line> = {}): Line {
  return {
    id: 'L-1',
    batchId: 'B-1',
    claimId: 'C-1',
    code: '88305',
    dateOfService: '2026-10-01',
    billed: '100.00',
    paid: '60.00',
    adjustments: '40.00',
    state: 'Unmatched',
    allocations: [],
    version: 1,
    ...overrides,
  }
}

export function makeBatch(overrides: Partial<Batch> = {}): Batch {
  return { id: 'B-1', labId: 'LAB-A', expectedAmount: '0.00', status: 'Open', ...overrides }
}

export function makeCharge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: 'CH-1',
    labId: 'LAB-A',
    claimId: 'C-1',
    code: '88305',
    dateOfService: '2026-10-01',
    amount: '100.00',
    ...overrides,
  }
}

/** A promise you resolve or reject from the test, to control when a fake request finishes. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
