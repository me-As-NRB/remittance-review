/**
 * Money (spec 2.3). The API sends every amount as a string with exactly two
 * decimals ("120.00", "-200.00"). The app turns it into integer cents held in a
 * number, does all arithmetic on those integers, and formats only for display
 * ("$1,234.50", "−$200.00").
 */

const AMOUNT = /^(-?)(\d+)\.(\d{2})$/
const CHAR_CODE_ZERO = 48
/** U+2212, the minus sign the spec uses for displayed amounts. */
const MINUS_SIGN = '−'

/** Parses an API amount string into integer cents, one digit at a time (no floating point). */
export function parseCents(s: string): number {
  const match = AMOUNT.exec(s)
  if (!match) {
    throw new RangeError(`Invalid amount "${s}": expected digits with exactly two decimals, like "120.00"`)
  }
  const [, sign = '', whole = '', fraction = ''] = match
  let cents = 0
  for (const digit of whole + fraction) {
    cents = cents * 10 + (digit.charCodeAt(0) - CHAR_CODE_ZERO)
    if (cents > Number.MAX_SAFE_INTEGER) throw new RangeError(`Amount "${s}" is too large`)
  }
  // `|| 0` turns "-0.00" into 0 rather than -0.
  return sign === '-' ? -cents || 0 : cents
}

/** Formats integer cents for display: 123450 → "$1,234.50", -20000 → "−$200.00". */
export function formatCents(c: number): string {
  const { negative, dollars, cents } = split(c)
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? MINUS_SIGN : ''}$${grouped}.${cents}`
}

/** Turns integer cents back into the API's amount string: 12050 → "120.50", -20000 → "-200.00". */
export function toAmount(c: number): string {
  const { negative, dollars, cents } = split(c)
  return `${negative ? '-' : ''}${dollars}.${cents}`
}

function split(c: number): { negative: boolean; dollars: number; cents: string } {
  if (!Number.isSafeInteger(c)) throw new RangeError(`Expected integer cents, got ${c}`)
  const abs = Math.abs(c)
  const remainder = abs % 100
  return {
    negative: c < 0,
    // abs - remainder is a multiple of 100, so this division is exact.
    dollars: (abs - remainder) / 100,
    cents: String(remainder).padStart(2, '0'),
  }
}
