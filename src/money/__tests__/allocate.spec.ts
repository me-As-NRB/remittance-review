import { describe, expect, it } from 'vitest'
import { allocate } from '../allocate'
import { parseCents } from '../cents'

type Charge = { id: string; amountCents: number }
const charge = (id: string, amount: string): Charge => ({ id, amountCents: parseCents(amount) })

describe('allocate (R4)', () => {
  it.each<{ name: string; paid: string; charges: Charge[]; expected: Record<string, string> }>([
    {
      name: 'even split (L-6 across CH-41 and CH-42)',
      paid: '200.00',
      charges: [charge('CH-41', '250.00'), charge('CH-42', '250.00')],
      expected: { 'CH-41': '100.00', 'CH-42': '100.00' },
    },
    {
      name: 'leftover cent goes to the largest amount',
      paid: '100.01',
      charges: [charge('CH-1', '60.00'), charge('CH-2', '40.00')],
      expected: { 'CH-1': '60.01', 'CH-2': '40.00' },
    },
    {
      name: 'leftover cent goes to the largest amount even when listed last',
      paid: '100.01',
      charges: [charge('CH-2', '40.00'), charge('CH-1', '60.00')],
      expected: { 'CH-2': '40.00', 'CH-1': '60.01' },
    },
    {
      name: 'three-way tie: leftover cent goes to the lowest id',
      paid: '100.00',
      charges: [charge('CH-3', '33.33'), charge('CH-1', '33.33'), charge('CH-2', '33.33')],
      expected: { 'CH-1': '33.34', 'CH-2': '33.33', 'CH-3': '33.33' },
    },
    {
      name: 'negative paid: split abs(paid), then apply the sign',
      paid: '-100.01',
      charges: [charge('CH-1', '60.00'), charge('CH-2', '40.00')],
      expected: { 'CH-1': '-60.01', 'CH-2': '-40.00' },
    },
    {
      name: 'two leftover cents go one at a time to the two largest amounts',
      paid: '0.05',
      charges: [charge('CH-A', '1.00'), charge('CH-B', '3.00'), charge('CH-C', '2.00')],
      expected: { 'CH-A': '0.00', 'CH-B': '0.03', 'CH-C': '0.02' },
    },
    {
      name: 'ordinal id compare: "CH-10" sorts before "CH-9"',
      paid: '0.01',
      charges: [charge('CH-9', '5.00'), charge('CH-10', '5.00')],
      expected: { 'CH-9': '0.00', 'CH-10': '0.01' },
    },
    {
      name: 'zero paid gives zero shares',
      paid: '0.00',
      charges: [charge('CH-1', '60.00'), charge('CH-2', '40.00')],
      expected: { 'CH-1': '0.00', 'CH-2': '0.00' },
    },
    {
      name: 'a single charge takes the full paid amount, whatever its amount',
      paid: '120.00',
      charges: [charge('CH-11', '250.00')],
      expected: { 'CH-11': '120.00' },
    },
    {
      name: 'a single charge on a negative line takes the full negative amount',
      paid: '-200.00',
      charges: [charge('CH-21', '300.00')],
      expected: { 'CH-21': '-200.00' },
    },
  ])('$name', ({ paid, charges, expected }) => {
    const result = allocate(parseCents(paid), charges)

    expect(result.map((share) => share.chargeId)).toEqual(charges.map((c) => c.id))
    expect(Object.fromEntries(result.map((s) => [s.chargeId, s.amountCents]))).toEqual(
      Object.fromEntries(Object.entries(expected).map(([id, amount]) => [id, parseCents(amount)])),
    )
  })

  it('never returns -0 for a zero share of a negative amount', () => {
    const result = allocate(-1, [
      { id: 'CH-1', amountCents: 100 },
      { id: 'CH-2', amountCents: 100 },
    ])
    expect(result.map((s) => Object.is(s.amountCents, -0))).toEqual([false, false])
  })

  it('stays exact for amounts whose products overflow a double', () => {
    const big = 400_000_000_000_000 // $4 trillion in cents
    const result = allocate(big + 1, [
      { id: 'CH-1', amountCents: big },
      { id: 'CH-2', amountCents: big },
    ])
    expect(result).toEqual([
      { chargeId: 'CH-1', amountCents: big / 2 + 1 },
      { chargeId: 'CH-2', amountCents: big / 2 },
    ])
  })

  it('always adds up exactly to paid (300 random cases)', () => {
    let seed = 7
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647
    for (let run = 0; run < 300; run++) {
      const paid = Math.floor(random() * 2_000_000) - 1_000_000
      const charges = Array.from({ length: 2 + Math.floor(random() * 5) }, (_, i) => ({
        id: `CH-${i}`,
        amountCents: 1 + Math.floor(random() * 100_000),
      }))
      const sum = allocate(paid, charges).reduce((total, share) => total + share.amountCents, 0)
      expect(sum).toBe(paid)
    }
  })

  it.each<[string, number, Charge[]]>([
    ['no charges', 100, []],
    ['non-integer paid', 1.5, [{ id: 'CH-1', amountCents: 1 }]],
    ['a negative charge amount in a split', 100, [{ id: 'CH-1', amountCents: 100 }, { id: 'CH-2', amountCents: -1 }]],
    ['only zero amounts in a split', 100, [{ id: 'CH-1', amountCents: 0 }, { id: 'CH-2', amountCents: 0 }]],
  ])('rejects %s', (_name, paid, charges) => {
    expect(() => allocate(paid, charges)).toThrow(RangeError)
  })
})
