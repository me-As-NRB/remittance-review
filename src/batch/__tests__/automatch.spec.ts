import { describe, expect, it } from 'vitest'
import { makeCharge, makeLine } from '@/__tests__/fixtures'
import { createSeed } from '@/mock/seed'
import { autoMatch } from '../automatch'

describe('autoMatch (R3)', () => {
  it('imports B-104 with exactly the states of spec 2.6 (written question Q1)', () => {
    const lines = createSeed().lines.filter((line) => line.batchId === 'B-104')
    const summary = Object.fromEntries(
      lines.map((line) => [line.id, [line.state, line.allocations.map((a) => `${a.chargeId}=${a.amount}`)]]),
    )

    expect(summary).toEqual({
      'L-1': ['Matched', ['CH-11=120.00']],
      'L-2': ['Matched', ['CH-12=30.00']],
      'L-3': ['Matched', ['CH-21=-200.00']],
      'L-4': ['Matched', ['CH-21=180.00']],
      'L-5': ['Matched', ['CH-31=100.00']],
      'L-6': ['Unmatched', []], // two candidates: CH-41 and CH-42
      'L-7': ['Unmatched', []], // no charge for claim C-999
      'L-8': ['Matched', ['CH-51=0.00']],
      'L-9': ['Unmatched', []], // invalid: 40.00 != 25.00 + 10.00, although CH-61 fits
    })
    expect(lines.every((line) => line.version === 1)).toBe(true)
  })

  it('matches on originalCode when the payer changed the code', () => {
    const line = makeLine({ code: '88305', originalCode: '88307' })
    const charges = [makeCharge({ id: 'CH-billed', code: '88307' }), makeCharge({ id: 'CH-other', code: '88342' })]
    expect(autoMatch(line, charges).allocations).toEqual([{ chargeId: 'CH-billed', amount: '60.00' }])
  })

  it('leaves the line Unmatched when two charges fit', () => {
    const charges = [makeCharge({ id: 'CH-1' }), makeCharge({ id: 'CH-2' })]
    expect(autoMatch(makeLine(), charges).state).toBe('Unmatched')
  })

  it.each([
    ['claim', { claimId: 'C-2' }],
    ['date of service', { dateOfService: '2026-10-02' }],
    ['code', { code: '88342' }],
  ])('needs the same %s', (_field, difference) => {
    expect(autoMatch(makeLine(), [makeCharge(difference)]).state).toBe('Unmatched')
  })

  it('never matches an invalid line', () => {
    const invalid = makeLine({ billed: '100.00', paid: '60.00', adjustments: '30.00' })
    expect(autoMatch(invalid, [makeCharge()]).state).toBe('Unmatched')
  })

  it('gives a matched line one allocation for its full paid amount, even a reversal', () => {
    const reversal = makeLine({ billed: '-100.00', paid: '-60.00', adjustments: '-40.00' })
    expect(autoMatch(reversal, [makeCharge()]).allocations).toEqual([{ chargeId: 'CH-1', amount: '-60.00' }])
  })
})
