import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { isAbortError, toApiError, type ApiClient, type ApiError } from '@/api/client'
import type { BatchSummary } from '@/batch/types'
import { useApiClient } from './useApiClient'

/** GET /batches/{id}: the batch, its server totals and canPost. Reloads when the id changes. */
export function useBatch(batchId: MaybeRefOrGetter<string>, options: { client?: ApiClient } = {}) {
  const client = useApiClient(options.client)
  const data = shallowRef<BatchSummary | null>(null)
  const loading = ref(false)
  const error = shallowRef<ApiError | null>(null)
  let controller: AbortController | undefined

  async function reload(): Promise<void> {
    controller?.abort()
    const current = (controller = new AbortController())
    loading.value = true
    error.value = null
    try {
      const batch = await client.getBatch(toValue(batchId), current.signal)
      if (current === controller) data.value = batch
    } catch (e) {
      if (current === controller && !isAbortError(e)) error.value = toApiError(e)
    } finally {
      if (current === controller) loading.value = false
    }
  }

  watch(
    () => toValue(batchId),
    () => {
      data.value = null
      void reload()
    },
    { immediate: true },
  )
  onScopeDispose(() => controller?.abort())

  return { data, loading, error, reload }
}
