import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { deferred, fakeClient, makeCharge } from '@/__tests__/fixtures'
import { ApiError, type ApiClient } from '@/api/client'
import type { Charge } from '@/batch/types'
import { SEARCH_DEBOUNCE_MS, useChargeSearch } from '../useChargeSearch'

interface PendingSearch {
  q: string
  signal?: AbortSignal
  resolve: (charges: Charge[]) => void
  reject: (reason: unknown) => void
}

const oldResults = [makeCharge({ id: 'CH-11', claimId: 'C-501' })]
const newResults = [makeCharge({ id: 'CH-41', claimId: 'C-504' })]

function setup() {
  const requests: PendingSearch[] = []
  const searchCharges = vi.fn<ApiClient['searchCharges']>((q, { signal } = {}) => {
    const response = deferred<Charge[]>()
    requests.push({ q, signal, resolve: response.resolve, reject: response.reject })
    return response.promise
  })
  const scope = effectScope()
  const search = scope.run(() => useChargeSearch({ client: fakeClient({ searchCharges }) }))
  if (!search) throw new Error('setup failed')

  async function type(text: string) {
    search!.query.value = text
    await nextTick()
  }
  const request = (index: number) => {
    const pending = requests[index]
    if (!pending) throw new Error(`no request #${index}`)
    return pending
  }
  return { search, searchCharges, type, request, scope }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useChargeSearch', () => {
  it('waits 300 ms after the last keystroke before searching', async () => {
    const { type, searchCharges } = setup()
    await type('C')
    await vi.advanceTimersByTimeAsync(100)
    await type('C-')
    await vi.advanceTimersByTimeAsync(100)
    await type('C-5')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1)
    expect(searchCharges).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(searchCharges).toHaveBeenCalledExactlyOnceWith(
      'C-5',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('a slow old response never overwrites a fast new one', async () => {
    const { search, type, request } = setup()
    await type('C-50')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    await type('C-504')
    expect(request(0).signal?.aborted).toBe(true) // the outdated request is cancelled
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)

    request(1).resolve(newResults) // the new search answers fast
    await flushPromises()
    expect(search.data.value).toEqual(newResults)

    request(0).resolve(oldResults) // the old one answers late anyway (server ignored the abort)
    await flushPromises()
    expect(search.data.value).toEqual(newResults)
    expect(search.loading.value).toBe(false)
  })

  it('an error from an old request never shows over new results', async () => {
    const { search, type, request } = setup()
    await type('C-50')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    await type('C-504')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)

    request(1).resolve(newResults)
    await flushPromises()
    request(0).reject(new ApiError('network', 0, 'Connection lost'))
    await flushPromises()

    expect(search.error.value).toBeNull()
    expect(search.data.value).toEqual(newResults)
  })

  it('an error from an old request is ignored while the new one is still loading', async () => {
    const { search, type, request } = setup()
    await type('C-50')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    await type('C-504')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)

    request(0).reject(new ApiError('network', 0, 'Connection lost'))
    await flushPromises()
    expect(search.error.value).toBeNull()
    expect(search.loading.value).toBe(true)

    request(1).resolve(newResults)
    await flushPromises()
    expect(search.data.value).toEqual(newResults)
    expect(search.loading.value).toBe(false)
  })

  it('ignores the abort error of a cancelled request', async () => {
    const { search, type, request } = setup()
    await type('C-50')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    await type('C-504')
    request(0).reject(new DOMException('The operation was aborted.', 'AbortError'))
    await flushPromises()
    expect(search.error.value).toBeNull()
  })

  it('shows the error of the latest request', async () => {
    const { search, type, request } = setup()
    await type('C-50')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    request(0).reject(new ApiError('validation', 422, 'Bad query'))
    await flushPromises()
    expect(search.error.value?.code).toBe('validation')
    expect(search.loading.value).toBe(false)
  })

  it('clearing the box cancels the search and clears results without calling the API', async () => {
    const { search, type, request, searchCharges } = setup()
    await type('C-50')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    request(0).resolve(oldResults)
    await flushPromises()

    await type('C-5')
    await type('  ')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2)
    expect(searchCharges).toHaveBeenCalledOnce()
    expect(search.data.value).toEqual([])
    expect(search.loading.value).toBe(false)
  })

  it('cancels the timer and the request in flight when the dialog closes', async () => {
    const { type, request, scope, searchCharges } = setup()
    await type('C-50')
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    await type('C-504')
    scope.stop()
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
    expect(searchCharges).toHaveBeenCalledOnce()
    expect(request(0).signal?.aborted).toBe(true)
  })
})
