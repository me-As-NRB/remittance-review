import { describe, expect, it } from 'vitest'
import { makeLine } from '@/__tests__/fixtures'
import { describeChange, describeLine, optimisticLine, type LineChange } from '../changes'

const L6 = makeLine({ id: 'L-6', billed: '500.00', paid: '200.00', adjustments: '300.00', version: 1 })

describe('optimisticLine', () => {
  it('splits exactly as the server will (R4), keeping the version', () => {
    const line = optimisticLine(L6, {
      kind: 'match',
      charges: [
        { id: 'CH-41', amount: '250.00' },
        { id: 'CH-42', amount: '250.00' },
      ],
    })
    expect(line).toMatchObject({
      state: 'Matched',
      version: 1,
      allocations: [
        { chargeId: 'CH-41', amount: '100.00' },
        { chargeId: 'CH-42', amount: '100.00' },
      ],
    })
  })

  it('clears allocations when moving to a state, and keeps the reason', () => {
    const matched = makeLine({ state: 'Matched', allocations: [{ chargeId: 'CH-1', amount: '60.00' }] })
    expect(optimisticLine(matched, { kind: 'state', state: 'Excluded', reason: 'Duplicate' })).toMatchObject({
      state: 'Excluded',
      allocations: [],
      reason: 'Duplicate',
    })
  })

  it('drops the old reason when a line goes back to Unmatched', () => {
    const excluded = makeLine({ state: 'Excluded', reason: 'Duplicate' })
    expect(optimisticLine(excluded, { kind: 'state', state: 'Unmatched' })).not.toHaveProperty('reason')
  })
})

describe('describing changes for people', () => {
  it.each<[LineChange, string]>([
    [{ kind: 'match', charges: [{ id: 'CH-41', amount: '1.00' }] }, 'Match to CH-41'],
    [
      {
        kind: 'match',
        charges: [
          { id: 'CH-1', amount: '1.00' },
          { id: 'CH-2', amount: '1.00' },
          { id: 'CH-3', amount: '1.00' },
        ],
      },
      'Match to CH-1, CH-2 and CH-3',
    ],
    [{ kind: 'state', state: 'Suspense' }, 'Send to suspense'],
    [{ kind: 'state', state: 'Excluded', reason: 'Dup' }, 'Exclude (reason: Dup)'],
    [{ kind: 'state', state: 'Unmatched' }, 'Unmatch'],
  ])('%o → %s', (change, text) => {
    expect(describeChange(change)).toBe(text)
  })

  it('describes a matched line with its shares', () => {
    const line = makeLine({
      state: 'Matched',
      allocations: [
        { chargeId: 'CH-41', amount: '100.00' },
        { chargeId: 'CH-42', amount: '-100.00' },
      ],
    })
    expect(describeLine(line)).toBe('Matched to CH-41 $100.00 and CH-42 −$100.00')
  })
})
