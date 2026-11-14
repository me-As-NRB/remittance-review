import { describe, expect, it } from 'vitest'
import { parseCents } from '@/money/cents'
import { createSeed, HTML_REMARK } from '../seed'

describe('seed', () => {
  const seed = createSeed()
  const linesOf = (batchId: string) => seed.lines.filter((line) => line.batchId === batchId)

  it('has B-104 as in spec 2.6: nine lines, expecting $505.00', () => {
    const batch = seed.batches.find((b) => b.id === 'B-104')
    expect(batch).toEqual({ id: 'B-104', labId: 'LAB-A', expectedAmount: '505.00', status: 'Open' })
    expect(linesOf('B-104').map((l) => [l.id, l.claimId, l.code, l.originalCode, l.billed, l.paid, l.adjustments])).toEqual([
      ['L-1', 'C-501', '88305', undefined, '250.00', '120.00', '130.00'],
      ['L-2', 'C-501', '88342', undefined, '150.00', '30.00', '120.00'],
      ['L-3', 'C-502', '88305', undefined, '-300.00', '-200.00', '-100.00'],
      ['L-4', 'C-502', '88305', undefined, '300.00', '180.00', '120.00'],
      ['L-5', 'C-503', '88305', '88307', '250.00', '100.00', '150.00'],
      ['L-6', 'C-504', '88305', undefined, '500.00', '200.00', '300.00'],
      ['L-7', 'C-999', '88104', undefined, '80.00', '50.00', '30.00'],
      ['L-8', 'C-505', '88312', undefined, '95.00', '0.00', '95.00'],
      ['L-9', 'C-506', '88300', undefined, '40.00', '25.00', '10.00'],
    ])
  })

  it('has the eight LAB-A charges of spec 2.6', () => {
    const b104Claims = new Set(linesOf('B-104').map((l) => l.claimId))
    const charges = seed.charges.filter((c) => c.labId === 'LAB-A' && b104Claims.has(c.claimId))
    expect(charges.map((c) => [c.id, c.claimId, c.code, c.dateOfService, c.amount])).toEqual([
      ['CH-11', 'C-501', '88305', '2026-10-01', '250.00'],
      ['CH-12', 'C-501', '88342', '2026-10-01', '150.00'],
      ['CH-21', 'C-502', '88305', '2026-10-01', '300.00'],
      ['CH-31', 'C-503', '88307', '2026-10-01', '250.00'],
      ['CH-41', 'C-504', '88305', '2026-10-02', '250.00'],
      ['CH-42', 'C-504', '88305', '2026-10-02', '250.00'],
      ['CH-51', 'C-505', '88312', '2026-10-02', '95.00'],
      ['CH-61', 'C-506', '88300', '2026-10-03', '40.00'],
    ])
  })

  it('has a posted batch whose decided lines add up to its expected amount', () => {
    const posted = seed.batches.find((b) => b.status === 'Posted')
    expect(posted?.id).toBe('B-099')
    const total = linesOf('B-099').reduce((sum, l) => sum + parseCents(l.paid), 0)
    expect(total).toBe(parseCents(posted?.expectedAmount ?? '0.00'))
  })

  it('has a batch of 500 generated lines whose paid adds up to the expected amount', () => {
    const lines = linesOf('B-500')
    expect(lines).toHaveLength(500)
    const batch = seed.batches.find((b) => b.id === 'B-500')
    expect(lines.reduce((sum, l) => sum + parseCents(l.paid), 0)).toBe(parseCents(batch?.expectedAmount ?? ''))
    expect(new Set(lines.map((l) => l.state))).toEqual(new Set(['Matched', 'Unmatched']))
  })

  it('includes a remark with HTML that the UI must show as text', () => {
    expect(seed.lines.some((l) => l.remark === HTML_REMARK)).toBe(true)
    expect(HTML_REMARK).toContain('<img src=x onerror=alert(1)>')
  })

  it('is generated the same way every time', () => {
    expect(createSeed()).toEqual(seed)
  })
})
