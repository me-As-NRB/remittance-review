import { isValidLine } from './rules'
import type { Charge, Line } from './types'

/**
 * R3: auto-match runs once, when a batch is imported. A valid line is matched
 * when exactly one charge of the same lab has the same claimId, dateOfService
 * and code. When the insurer changed the code, the line keeps the billed code in
 * originalCode, and that is the code the lab's charge carries, so it is used instead.
 */
export function candidateCharges(line: Line, labCharges: readonly Charge[]): Charge[] {
  const code = line.originalCode ?? line.code
  return labCharges.filter(
    (charge) =>
      charge.claimId === line.claimId &&
      charge.dateOfService === line.dateOfService &&
      charge.code === code,
  )
}

export function autoMatch(line: Line, labCharges: readonly Charge[]): Line {
  if (!isValidLine(line)) return line
  const [only, ...others] = candidateCharges(line, labCharges)
  if (!only || others.length > 0) return line
  return { ...line, state: 'Matched', allocations: [{ chargeId: only.id, amount: line.paid }] }
}
