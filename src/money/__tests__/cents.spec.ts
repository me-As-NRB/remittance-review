import { describe, expect, it } from 'vitest'
import { formatCents, parseCents, toAmount } from '../cents'

describe('parseCents', () => {
  it.each([
    ['120.00', 12000],
    ['120.50', 12050],
    ['0.00', 0],
    ['0.01', 1],
    ['-200.00', -20000],
    ['-0.05', -5],
    ['007.10', 710],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('parses %s as %i cents', (input, expected) => {
    expect(parseCents(input)).toBe(expected)
  })

  it('returns 0, not -0, for "-0.00"', () => {
    expect(Object.is(parseCents('-0.00'), 0)).toBe(true)
  })

  it.each(['120', '120.5', '120.500', '1,234.50', '+1.00', ' 1.00', '1.00 ', '', '.50', '1e2', 'abc'])(
    'rejects %j because it is not exactly two decimals',
    (input) => {
      expect(() => parseCents(input)).toThrow(RangeError)
    },
  )

  it('rejects amounts too large for exact integer cents', () => {
    expect(() => parseCents('90071992547409.92')).toThrow(/too large/)
  })
})

describe('formatCents', () => {
  it.each([
    [123450, '$1,234.50'],
    [-20000, '−$200.00'],
    [0, '$0.00'],
    [5, '$0.05'],
    [-5, '−$0.05'],
    [100, '$1.00'],
    [123456789, '$1,234,567.89'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatCents(input)).toBe(expected)
  })

  it('uses the minus sign U+2212, not a hyphen', () => {
    expect(formatCents(-1)).not.toContain('-')
  })

  it('rejects anything that is not integer cents', () => {
    expect(() => formatCents(1.5)).toThrow(RangeError)
    expect(() => formatCents(Number.NaN)).toThrow(RangeError)
  })
})

describe('toAmount', () => {
  it.each([
    [12050, '120.50'],
    [-20000, '-200.00'],
    [0, '0.00'],
    [7, '0.07'],
  ])('turns %i cents back into %s', (input, expected) => {
    expect(toAmount(input)).toBe(expected)
  })

  it('round-trips with parseCents', () => {
    for (const amount of ['0.00', '0.99', '-0.01', '1234.56', '-98765.43']) {
      expect(toAmount(parseCents(amount))).toBe(amount)
    }
  })
})
