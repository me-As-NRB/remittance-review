/**
 * R4: splits a line's paid amount across charges. This is the only place the
 * rule is implemented: the mock server and the split preview both call it.
 *
 * - One charge gets the full paid amount.
 * - With two or more, each charge gets a share of abs(paid) in proportion to its
 *   amount, rounded down to the cent. Leftover cents go one at a time to the
 *   charges with the largest amount (ties: lowest id, ordinal string compare).
 *   Then the sign of paid is applied to every share.
 *
 * Shares are returned in the same order as `charges` and always add up exactly
 * to `paidCents`. Products use BigInt so large amounts can't lose precision.
 */
export function allocate(
  paidCents: number,
  charges: { id: string; amountCents: number }[],
): { chargeId: string; amountCents: number }[] {
  if (!Number.isSafeInteger(paidCents)) throw new RangeError('paidCents must be integer cents')
  const [first] = charges
  if (!first) throw new RangeError('allocate needs at least one charge')
  if (charges.length === 1) return [{ chargeId: first.id, amountCents: paidCents }]

  for (const charge of charges) {
    if (!Number.isSafeInteger(charge.amountCents) || charge.amountCents < 0) {
      throw new RangeError(`Charge ${charge.id} needs a non-negative integer amount to be split`)
    }
  }
  const total = charges.reduce((sum, charge) => sum + BigInt(charge.amountCents), 0n)
  if (total === 0n) throw new RangeError('Cannot split across charges whose amounts are all zero')

  const absPaid = BigInt(Math.abs(paidCents))
  // BigInt division truncates, which is rounding down for these non-negative values.
  const shares = charges.map((charge) => (absPaid * BigInt(charge.amountCents)) / total)
  let leftover = absPaid - shares.reduce((sum, share) => sum + share, 0n)

  // Each share lost less than one cent, so leftover < charges.length: one pass is enough.
  const byLargestAmount = charges
    .map((charge, index) => ({ charge, index }))
    .sort((a, b) => b.charge.amountCents - a.charge.amountCents || compareIds(a.charge.id, b.charge.id))
  for (const { index } of byLargestAmount) {
    if (leftover === 0n) break
    shares[index] = (shares[index] ?? 0n) + 1n
    leftover -= 1n
  }

  const sign = paidCents < 0 ? -1 : 1
  return charges.map((charge, index) => ({
    chargeId: charge.id,
    // `|| 0` keeps a zero share from becoming -0 when paid is negative.
    amountCents: sign * Number(shares[index] ?? 0n) || 0,
  }))
}

/** Ordinal (code unit) comparison, so the result never depends on the user's locale. */
function compareIds(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
