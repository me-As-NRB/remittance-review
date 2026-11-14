import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { deferred, fakeClient, makeSummary } from '@/__tests__/fixtures'
import { ApiError, type ApiClient } from '@/api/client'
import type { BatchSummary } from '@/batch/types'
import { useBatch } from '../useBatch'

describe('useBatch', () => {
  it('loads the batch and exposes data, loading and error', async () => {
    const summary = makeSummary({ id: 'B-104' })
    const getBatch = vi.fn<ApiClient['getBatch']>().mockResolvedValue(summary)
    const batch = effectScope().run(() => useBatch('B-104', { client: fakeClient({ getBatch }) }))!

    expect(batch.loading.value).toBe(true)
    await flushPromises()
    expect(batch.data.value).toEqual(summary)
    expect(batch.loading.value).toBe(false)
    expect(batch.error.value).toBeNull()
  })

  it('keeps only the newest answer when reloads overlap', async () => {
    const first = deferred<BatchSummary>()
    const second = deferred<BatchSummary>()
    const getBatch = vi
      .fn<ApiClient['getBatch']>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const batch = effectScope().run(() => useBatch('B-104', { client: fakeClient({ getBatch }) }))!

    void batch.reload()
    expect(getBatch.mock.calls[0]?.[1]?.aborted).toBe(true)
    second.resolve(makeSummary({ status: 'Posted' }))
    first.resolve(makeSummary({ status: 'Open' }))
    await flushPromises()
    expect(batch.data.value?.status).toBe('Posted')
  })

  it('reports a missing batch as a not_found error', async () => {
    const getBatch = vi.fn<ApiClient['getBatch']>().mockRejectedValue(new ApiError('not_found', 404, 'Not found'))
    const batch = effectScope().run(() => useBatch('B-404', { client: fakeClient({ getBatch }) }))!
    await flushPromises()
    expect(batch.error.value?.code).toBe('not_found')
    expect(batch.data.value).toBeNull()
  })

  it('reloads when the batch id changes', async () => {
    const getBatch = vi.fn<ApiClient['getBatch']>((id) => Promise.resolve(makeSummary({ id })))
    const id = ref('B-104')
    const batch = effectScope().run(() => useBatch(id, { client: fakeClient({ getBatch }) }))!
    await flushPromises()
    id.value = 'B-500'
    await flushPromises()
    expect(batch.data.value?.id).toBe('B-500')
  })
})
