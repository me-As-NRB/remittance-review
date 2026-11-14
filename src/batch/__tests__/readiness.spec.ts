import { describe, expect, it } from 'vitest'
import { makeBatch, makeLine } from '@/__tests__/fixtures'
import { readiness } from '../readiness'
import type { LineState } from '../types'

const line = (id: string, paid: string, state: LineState) =>
  makeLine({ id, paid, billed: paid, adjustments: '0.00', state })

describe('readiness (R5)', () => {
  it('B-104 right after import: 3 lines unmatched and totals differ by $275.00', () => {
    const batch = makeBatch({ id: 'B-104', expectedAmount: '505.00' })
    const lines = [
      line('L-1', '120.00', 'Matched'),
      line('L-2', '30.00', 'Matched'),
      line('L-3', '-200.00', 'Matched'),
      line('L-4', '180.00', 'Matched'),
      line('L-5', '100.00', 'Matched'),
      line('L-6', '200.00', 'Unmatched'),
      line('L-7', '50.00', 'Unmatched'),
      line('L-8', '0.00', 'Matched'),
      line('L-9', '25.00', 'Unmatched'),
    ]

    expect(readiness(batch, lines)).toEqual({
      ready: false,
      reasons: ['3 lines unmatched', 'Totals differ by $275.00'],
    })
  })

  it('B-104 once L-6 is split, L-7 is in suspense and L-9 is excluded: ready', () => {
    const batch = makeBatch({ expectedAmount: '505.00' })
    const lines = [
      line('L-1', '120.00', 'Matched'),
      line('L-2', '30.00', 'Matched'),
      line('L-3', '-200.00', 'Matched'),
      line('L-4', '180.00', 'Matched'),
      line('L-5', '100.00', 'Matched'),
      line('L-6', '200.00', 'Matched'),
      line('L-7', '50.00', 'Suspense'),
      line('L-8', '0.00', 'Matched'),
      line('L-9', '25.00', 'Excluded'),
    ]
    expect(readiness(batch, lines)).toEqual({ ready: true, reasons: [] })
  })

  it('counts a reversal line as negative money, not its absolute value', () => {
    const batch = makeBatch({ expectedAmount: '100.00' })
    const lines = [line('L-1', '300.00', 'Matched'), line('L-2', '-200.00', 'Matched')]
    expect(readiness(batch, lines)).toEqual({ ready: true, reasons: [] })
  })

  it('reports the difference when a reversal is still unmatched', () => {
    const batch = makeBatch({ expectedAmount: '100.00' })
    const lines = [line('L-1', '300.00', 'Matched'), line('L-2', '-200.00', 'Unmatched')]
    expect(readiness(batch, lines).reasons).toEqual(['1 line unmatched', 'Totals differ by $200.00'])
  })

  it('is never ready once the batch is Posted, even when everything adds up', () => {
    const batch = makeBatch({ status: 'Posted', expectedAmount: '150.00' })
    const lines = [line('P-1', '100.00', 'Matched'), line('P-2', '50.00', 'Suspense')]
    expect(readiness(batch, lines)).toEqual({ ready: false, reasons: ['Batch is posted'] })
  })

  it('lists every reason, in the order of R5, for a posted batch with problems', () => {
    const batch = makeBatch({ status: 'Posted', expectedAmount: '10.00' })
    expect(readiness(batch, [line('L-1', '5.00', 'Unmatched')]).reasons).toEqual([
      'Batch is posted',
      '1 line unmatched',
      'Totals differ by $10.00',
    ])
  })

  it('reports the difference as an absolute amount when decided lines exceed the expected total', () => {
    const batch = makeBatch({ expectedAmount: '100.00' })
    expect(readiness(batch, [line('L-1', '125.00', 'Matched')]).reasons).toEqual([
      'Totals differ by $25.00',
    ])
  })

  it('counts Excluded and Suspense lines towards the total, and Unmatched lines not at all', () => {
    const batch = makeBatch({ expectedAmount: '30.00' })
    const lines = [
      line('L-1', '10.00', 'Excluded'),
      line('L-2', '20.00', 'Suspense'),
      line('L-3', '999.00', 'Unmatched'),
    ]
    expect(readiness(batch, lines).reasons).toEqual(['1 line unmatched'])
  })

  it('treats an empty batch that expects nothing as ready', () => {
    expect(readiness(makeBatch({ expectedAmount: '0.00' }), [])).toEqual({ ready: true, reasons: [] })
  })

  it('uses thousands separators in the difference', () => {
    const batch = makeBatch({ expectedAmount: '1234.50' })
    expect(readiness(batch, []).reasons).toEqual(['Totals differ by $1,234.50'])
  })
})
