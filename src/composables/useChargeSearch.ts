import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { isAbortError, toApiError, type ApiClient, type ApiError } from '@/api/client'
import type { Charge } from '@/batch/types'
import { useApiClient } from './useApiClient'

export const SEARCH_DEBOUNCE_MS = 300

/**
 * GET /charges as you type: waits 300 ms after the last keystroke, then searches.
 * A stale response can never overwrite a newer one: every change of the query
 * aborts the request in flight (AbortController) and invalidates it, so even a
 * server that ignores the abort, or a request that fails late, is dropped.
 */
export function useChargeSearch(
  options: { client?: ApiClient; initialQuery?: string; limit?: number } = {},
) {
  const client = useApiClient(options.client)
  const query = ref(options.initialQuery ?? '')
  const data = shallowRef<Charge[]>([])
  const loading = ref(false)
  const error = shallowRef<ApiError | null>(null)

  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  /** Only the request with this number may write results. */
  let latest = 0

  function invalidate(): void {
    clearTimeout(timer)
    controller?.abort()
    latest++
  }

  async function search(q: string): Promise<void> {
    const current = (controller = new AbortController())
    const requestNumber = ++latest
    try {
      const results = await client.searchCharges(q, { limit: options.limit, signal: current.signal })
      if (requestNumber === latest) data.value = results
    } catch (e) {
      // An outdated request that fails must not replace newer results with an error.
      if (requestNumber === latest && !isAbortError(e)) error.value = toApiError(e)
    } finally {
      if (requestNumber === latest) loading.value = false
    }
  }

  watch(
    query,
    (value) => {
      invalidate()
      const q = value.trim()
      error.value = null
      if (!q) {
        data.value = []
        loading.value = false
        return
      }
      loading.value = true
      timer = setTimeout(() => void search(q), SEARCH_DEBOUNCE_MS)
    },
    { immediate: true },
  )
  onScopeDispose(invalidate)

  return { query, data, loading, error }
}
