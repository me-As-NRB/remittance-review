import { describe, expect, it } from 'vitest'
import { makeLine } from '@/__tests__/fixtures'
import { isValidLine, totalsByState, validityGapCents } from '../rules'

describe('isValidLine (R1)', () => {
  it.each([
    ['250.00', '120.00', '130.00', true],
    ['-300.00', '-200.00', '-100.00', true],
    ['95.00', '0.00', '95.00', true],
    ['40.00', '25.00', '10.00', false],
    ['0.01', '0.00', '0.00', false],
  ])('billed %s, paid %s, adjustments %s → valid: %s', (billed, paid, adjustments, valid) => {
    expect(isValidLine({ billed, paid, adjustments })).toBe(valid)
  })

  it('reports how far an invalid line is off', () => {
    expect(validityGapCents({ billed: '40.00', paid: '25.00', adjustments: '10.00' })).toBe(500)
  })
})

describe('totalsByState', () => {
  it('sums paid per state in cents, keeping reversals negative', () => {
    const lines = [
      makeLine({ id: 'L-1', paid: '120.00', state: 'Matched' }),
      makeLine({ id: 'L-2', paid: '-200.00', state: 'Matched' }),
      makeLine({ id: 'L-3', paid: '50.00', state: 'Suspense' }),
      makeLine({ id: 'L-4', paid: '25.00', state: 'Unmatched' }),
    ]
    expect(totalsByState(lines)).toEqual({ Unmatched: 2500, Matched: -8000, Suspense: 5000, Excluded: 0 })
  })
})
