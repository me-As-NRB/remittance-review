import { autoMatch } from '@/batch/automatch'
import type { Batch, Charge, Line } from '@/batch/types'
import { toAmount } from '@/money/cents'

/** There is no login: the mock always acts as a user of this lab. */
export const CALLER_LAB = 'LAB-A'

export interface SeedData {
  batches: Batch[]
  lines: Line[]
  charges: Charge[]
}

/** The remark the spec asks for: HTML that must show up as plain text, never run. */
export const HTML_REMARK = 'Claim not on file <img src=x onerror=alert(1)>'

// Reference batch B-104 and the charges of LAB-A, exactly as in spec 2.6.
type Row = [id: string, claimId: string, code: string, originalCode: string, dateOfService: string, billed: string, paid: string, adjustments: string, remark: string]
const B104_ROWS: Row[] = [
  ['L-1', 'C-501', '88305', '', '2026-10-01', '250.00', '120.00', '130.00', ''],
  ['L-2', 'C-501', '88342', '', '2026-10-01', '150.00', '30.00', '120.00', ''],
  ['L-3', 'C-502', '88305', '', '2026-10-01', '-300.00', '-200.00', '-100.00', 'Reversal of an earlier payment'],
  ['L-4', 'C-502', '88305', '', '2026-10-01', '300.00', '180.00', '120.00', ''],
  ['L-5', 'C-503', '88305', '88307', '2026-10-01', '250.00', '100.00', '150.00', 'Code changed by payer'],
  ['L-6', 'C-504', '88305', '', '2026-10-02', '500.00', '200.00', '300.00', ''],
  ['L-7', 'C-999', '88104', '', '2026-10-02', '80.00', '50.00', '30.00', HTML_REMARK],
  ['L-8', 'C-505', '88312', '', '2026-10-02', '95.00', '0.00', '95.00', 'Applied to deductible'],
  ['L-9', 'C-506', '88300', '', '2026-10-03', '40.00', '25.00', '10.00', ''],
]

type ChargeRow = [id: string, claimId: string, code: string, dateOfService: string, amount: string]
const LAB_A_CHARGE_ROWS: ChargeRow[] = [
  ['CH-11', 'C-501', '88305', '2026-10-01', '250.00'],
  ['CH-12', 'C-501', '88342', '2026-10-01', '150.00'],
  ['CH-21', 'C-502', '88305', '2026-10-01', '300.00'],
  ['CH-31', 'C-503', '88307', '2026-10-01', '250.00'],
  ['CH-41', 'C-504', '88305', '2026-10-02', '250.00'],
  ['CH-42', 'C-504', '88305', '2026-10-02', '250.00'],
  ['CH-51', 'C-505', '88312', '2026-10-02', '95.00'],
  ['CH-61', 'C-506', '88300', '2026-10-03', '40.00'],
]

export function createSeed(): SeedData {
  const charges: Charge[] = [
    ...LAB_A_CHARGE_ROWS.map((row) => charge(CALLER_LAB, ...row)),
    // Another lab with an overlapping claim id: it must never show up for LAB-A.
    charge('LAB-B', 'CH-B11', 'C-501', '88305', '2026-10-01', '250.00'),
    // Charges of the posted batch below.
    charge(CALLER_LAB, 'CH-91', 'C-401', '88305', '2026-09-10', '200.00'),
  ]
  const batches: Batch[] = [
    { id: 'B-104', labId: CALLER_LAB, expectedAmount: '505.00', status: 'Open' },
    { id: 'B-099', labId: CALLER_LAB, expectedAmount: '150.00', status: 'Posted' },
  ]
  const lines: Line[] = [
    ...B104_ROWS.map(([id, claimId, code, originalCode, dateOfService, billed, paid, adjustments, remark]) =>
      line({ id, batchId: 'B-104', claimId, code, originalCode, dateOfService, billed, paid, adjustments, remark }),
    ),
    line({ id: 'P-1', batchId: 'B-099', claimId: 'C-401', code: '88305', dateOfService: '2026-09-10', billed: '200.00', paid: '100.00', adjustments: '100.00' }),
    line({ id: 'P-2', batchId: 'B-099', claimId: 'C-402', code: '88342', dateOfService: '2026-09-11', billed: '80.00', paid: '50.00', adjustments: '30.00' }),
  ]

  const large = generateLargeBatch()
  batches.push(large.batch)
  charges.push(...large.charges)
  lines.push(...large.lines)

  // R3: auto-match runs once per batch, when it is imported (here: when the seed loads).
  const labCharges = charges.filter((c) => c.labId === CALLER_LAB)
  const imported = lines.map((l) => autoMatch(l, labCharges))

  // The posted batch was fully reviewed before posting: P-2 went to suspense.
  return {
    batches,
    charges,
    lines: imported.map((l) => (l.id === 'P-2' ? { ...l, state: 'Suspense', version: 2 } : l)),
  }
}

function charge(labId: string, id: string, claimId: string, code: string, dateOfService: string, amount: string): Charge {
  return { id, labId, claimId, code, dateOfService, amount }
}

function line(fields: {
  id: string
  batchId: string
  claimId: string
  code: string
  originalCode?: string
  dateOfService: string
  billed: string
  paid: string
  adjustments: string
  remark?: string
}): Line {
  const { originalCode, remark, ...rest } = fields
  return {
    ...rest,
    ...(originalCode ? { originalCode } : {}),
    ...(remark ? { remark } : {}),
    state: 'Unmatched',
    allocations: [],
    version: 1,
  }
}

/**
 * B-500: 500 generated lines to check the table stays responsive. A fixed-seed
 * random generator makes it the same on every load. Every 25th line is invalid,
 * one in 25 has no charge, one in 25 has two candidate charges (needs a split),
 * and one in 50 is a reversal.
 */
function generateLargeBatch(): { batch: Batch; lines: Line[]; charges: Charge[] } {
  const random = mulberry32(500)
  const codes = ['88305', '88342', '88312', '88300', '88307']
  const lines: Line[] = []
  const charges: Charge[] = []
  let expectedCents = 0

  for (let i = 1; i <= 500; i++) {
    const kind = i % 25
    const claimId = `C-${7000 + i}`
    const code = codes[i % codes.length] ?? '88305'
    const dateOfService = `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`
    const sign = i % 50 === 3 ? -1 : 1
    const billed = sign * (5_000 + Math.floor(random() * 85_000))
    const paidPercent = 30 + Math.floor(random() * 60)
    const paid = sign * Math.floor((Math.abs(billed) * paidPercent) / 100)
    // Invalid lines are off by $1.00 so billed != paid + adjustments.
    const adjustments = billed - paid - (kind === 0 ? sign * 100 : 0)
    expectedCents += paid

    lines.push(
      line({
        id: `G-${String(i).padStart(3, '0')}`,
        batchId: 'B-500',
        claimId,
        code,
        dateOfService,
        billed: toAmount(billed),
        paid: toAmount(paid),
        adjustments: toAmount(adjustments),
        ...(i % 40 === 7 ? { remark: 'Partial payment, see payer letter' } : {}),
      }),
    )

    const chargeCents = Math.abs(billed)
    if (kind === 1) continue // no charge on file: stays Unmatched
    if (kind === 2) {
      const firstPart = Math.floor(chargeCents / 3)
      charges.push(charge(CALLER_LAB, `CH-${7000 + i}A`, claimId, code, dateOfService, toAmount(firstPart)))
      charges.push(charge(CALLER_LAB, `CH-${7000 + i}B`, claimId, code, dateOfService, toAmount(chargeCents - firstPart)))
      continue
    }
    charges.push(charge(CALLER_LAB, `CH-${7000 + i}`, claimId, code, dateOfService, toAmount(chargeCents)))
  }

  return {
    batch: { id: 'B-500', labId: CALLER_LAB, expectedAmount: toAmount(expectedCents), status: 'Open' },
    lines,
    charges,
  }
}

/** Small deterministic PRNG, so the generated batch is identical on every run. */
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
