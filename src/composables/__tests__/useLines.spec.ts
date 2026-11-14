import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { deferred, fakeClient, makeLine } from '@/__tests__/fixtures'
import { ApiError, type ApiClient } from '@/api/client'
import type { Problem } from '@/api/problem'
import type { Line } from '@/batch/types'
import { useLines } from '../useLines'

const L6 = makeLine({ id: 'L-6', claimId: 'C-504', billed: '500.00', paid: '200.00', adjustments: '300.00' })
const L7 = makeLine({ id: 'L-7', claimId: 'C-999', billed: '80.00', paid: '50.00', adjustments: '30.00' })
const SPLIT = [
  { id: 'CH-41', amount: '250.00' },
  { id: 'CH-42', amount: '250.00' },
]

function problem(code: Problem['code'], status: number, extra: Partial<Problem> = {}): ApiError {
  return new ApiError(code, status, 'Server title', { type: '/problems/x', title: 'Server title', status, code, ...extra })
}

async function setup(overrides: Partial<ApiClient> = {}) {
  const announce = vi.fn()
  const onChanged = vi.fn()
  const onBatchPosted = vi.fn()
  const client = fakeClient({ getLines: () => Promise.resolve([L6, L7]), ...overrides })
  const scope = effectScope()
  const lines = scope.run(() => useLines('B-104', { client, announce, onChanged, onBatchPosted }))
  if (!lines) throw new Error('setup failed')
  await flushPromises()
  const row = (id: string) => lines.data.value.find((line) => line.id === id)
  return { lines, row, announce, onChanged, onBatchPosted }
}

describe('useLines', () => {
  it('loads the lines of the batch', async () => {
    const { lines } = await setup()
    expect(lines.data.value.map((l) => l.id)).toEqual(['L-6', 'L-7'])
    expect(lines.loading.value).toBe(false)
  })

  it('updates the row immediately, then replaces it with the server line', async () => {
    const response = deferred<Line>()
    const matchLine = vi.fn(() => response.promise)
    const { lines, row, onChanged } = await setup({ matchLine })

    void lines.match('L-6', SPLIT)
    expect(row('L-6')).toMatchObject({
      state: 'Matched',
      version: 1,
      allocations: [
        { chargeId: 'CH-41', amount: '100.00' },
        { chargeId: 'CH-42', amount: '100.00' },
      ],
    })
    expect(lines.rowStatus.get('L-6')).toEqual({ saving: true })
    expect(matchLine).toHaveBeenCalledWith('L-6', { version: 1, chargeIds: ['CH-41', 'CH-42'] })

    const saved = { ...row('L-6')!, version: 2 }
    response.resolve(saved)
    await flushPromises()
    expect(row('L-6')).toBe(saved)
    expect(lines.rowStatus.has('L-6')).toBe(false)
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('409 stale_version: rolls back, offers both versions, and Keep mine retries with the new version', async () => {
    const theirs: Line = { ...L6, state: 'Suspense', reason: 'Checking', version: 2 }
    const retry = deferred<Line>()
    const matchLine = vi
      .fn<ApiClient['matchLine']>()
      .mockRejectedValueOnce(problem('stale_version', 409, { current: theirs }))
      .mockReturnValueOnce(retry.promise)
    const { lines, row, announce } = await setup({ matchLine })

    await lines.match('L-6', SPLIT)
    expect(row('L-6')).toEqual(L6) // rolled back to what the user had
    expect(lines.rowStatus.get('L-6')?.conflict).toEqual({ mine: { kind: 'match', charges: SPLIT }, theirs })
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('changed by someone else'), 'assertive')

    void lines.keepMine('L-6')
    expect(matchLine).toHaveBeenLastCalledWith('L-6', { version: 2, chargeIds: ['CH-41', 'CH-42'] })
    expect(row('L-6')).toMatchObject({ state: 'Matched', version: 2 }) // optimistic again, on top of theirs

    const saved: Line = { ...row('L-6')!, version: 3 }
    retry.resolve(saved)
    await flushPromises()
    expect(row('L-6')).toEqual(saved)
    expect(lines.rowStatus.has('L-6')).toBe(false)
  })

  it('409 stale_version: Take theirs keeps the server line and sends nothing', async () => {
    const theirs: Line = { ...L6, state: 'Suspense', version: 2 }
    const matchLine = vi.fn<ApiClient['matchLine']>().mockRejectedValue(problem('stale_version', 409, { current: theirs }))
    const { lines, row, onChanged } = await setup({ matchLine })

    await lines.match('L-6', SPLIT)
    lines.takeTheirs('L-6')
    expect(row('L-6')).toEqual(theirs)
    expect(lines.rowStatus.has('L-6')).toBe(false)
    expect(matchLine).toHaveBeenCalledOnce()
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('409 batch_posted: rolls back and reports that the batch is posted', async () => {
    const setLineState = vi.fn<ApiClient['setLineState']>().mockRejectedValue(problem('batch_posted', 409))
    const { lines, row, onBatchPosted, announce } = await setup({ setLineState })

    await lines.changeState('L-7', 'Suspense')
    expect(row('L-7')).toEqual(L7)
    expect(lines.rowStatus.has('L-7')).toBe(false)
    expect(onBatchPosted).toHaveBeenCalledOnce()
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('read-only'), 'assertive')
  })

  it('422: rolls back and keeps the field errors for the row', async () => {
    const errors = { reason: ['Enter a reason for excluding this line'] }
    const setLineState = vi.fn<ApiClient['setLineState']>().mockRejectedValue(problem('validation', 422, { errors }))
    const { lines, row, announce } = await setup({ setLineState })

    await lines.changeState('L-7', 'Excluded', 'x')
    expect(row('L-7')).toEqual(L7)
    expect(lines.rowStatus.get('L-7')?.error).toEqual({ message: 'Line L-7 was not saved.', fields: errors })
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Enter a reason'), 'assertive')

    lines.dismissError('L-7')
    expect(lines.rowStatus.has('L-7')).toBe(false)
  })

  it('a network failure rolls back and shows a message', async () => {
    const setLineState = vi
      .fn<ApiClient['setLineState']>()
      .mockRejectedValue(new ApiError('network', 0, "Couldn't reach the server."))
    const { lines, row } = await setup({ setLineState })

    await lines.changeState('L-7', 'Suspense')
    expect(row('L-7')).toEqual(L7)
    expect(lines.rowStatus.get('L-7')?.error?.message).toBe('Line L-7 was not saved.')
  })

  it('sends the reason when excluding and clears allocations optimistically', async () => {
    const setLineState = vi.fn<ApiClient['setLineState']>(() => new Promise(() => {}))
    const { lines, row } = await setup({ setLineState })

    void lines.changeState('L-7', 'Excluded', 'Duplicate payment')
    expect(setLineState).toHaveBeenCalledWith('L-7', { version: 1, state: 'Excluded', reason: 'Duplicate payment' })
    expect(row('L-7')).toMatchObject({ state: 'Excluded', reason: 'Duplicate payment', allocations: [] })
  })

  it('ignores a second change on a row that is still saving', async () => {
    const setLineState = vi.fn<ApiClient['setLineState']>(() => new Promise(() => {}))
    const { lines } = await setup({ setLineState })

    void lines.changeState('L-7', 'Suspense')
    void lines.changeState('L-7', 'Excluded', 'Again')
    expect(setLineState).toHaveBeenCalledOnce()
  })

  it('a change to one line keeps every other line object as it was', async () => {
    const setLineState = vi.fn<ApiClient['setLineState']>(() => new Promise(() => {}))
    const { lines, row } = await setup({ setLineState })
    const untouched = row('L-6')
    void lines.changeState('L-7', 'Suspense')
    expect(row('L-6')).toBe(untouched)
  })
})
