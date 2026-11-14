import { onScopeDispose, ref, shallowReactive, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { isAbortError, toApiError, type ApiClient, type ApiError } from '@/api/client'
import { describeLine, optimisticLine, type LineChange } from '@/batch/changes'
import type { Charge, Line, TargetState } from '@/batch/types'
import { announce as announceToScreenReaders, type Politeness } from './useAnnouncer'
import { useApiClient } from './useApiClient'

/** Someone else changed the line first: the user's change, next to the server's current line. */
export interface Conflict {
  mine: LineChange
  theirs: Line
}

/** What a row shows besides its data: a save in flight, a conflict, or errors. */
export interface RowStatus {
  saving?: boolean
  conflict?: Conflict
  error?: { message: string; fields: Record<string, string[]> }
}

export interface UseLinesOptions {
  client?: ApiClient
  announce?: (message: string, politeness?: Politeness) => void
  /** After every confirmed write, e.g. to refresh the batch's server totals and canPost. */
  onChanged?: () => void
  /** A write answered 409 batch_posted: someone posted the batch. */
  onBatchPosted?: () => void
}

/**
 * GET /batches/{id}/lines plus the line writes (PUT /lines/{id}/match and /state).
 * Writes are optimistic: the row changes at once, then the server confirms it or
 * the row rolls back (spec 4.4). Lines are immutable objects in a shallowRef, so
 * a change to one line gives only that row new props.
 */
export function useLines(batchId: MaybeRefOrGetter<string>, options: UseLinesOptions = {}) {
  const client = useApiClient(options.client)
  const announce = options.announce ?? announceToScreenReaders
  const data = shallowRef<Line[]>([])
  const loading = ref(false)
  const error = shallowRef<ApiError | null>(null)
  const rowStatus = shallowReactive(new Map<string, RowStatus>())
  let controller: AbortController | undefined

  async function reload(): Promise<void> {
    controller?.abort()
    const current = (controller = new AbortController())
    loading.value = true
    error.value = null
    try {
      const lines = await client.getLines(toValue(batchId), current.signal)
      if (current === controller) data.value = lines
    } catch (e) {
      if (current === controller && !isAbortError(e)) error.value = toApiError(e)
    } finally {
      if (current === controller) loading.value = false
    }
  }

  const find = (id: string) => data.value.find((line) => line.id === id)
  const replace = (next: Line) => {
    data.value = data.value.map((line) => (line.id === next.id ? next : line))
  }
  const setStatus = (id: string, status?: RowStatus) => {
    if (status) rowStatus.set(id, status)
    else rowStatus.delete(id)
  }

  async function write(lineId: string, change: LineChange): Promise<void> {
    const before = find(lineId)
    if (!before || rowStatus.get(lineId)?.saving) return

    replace(optimisticLine(before, change))
    setStatus(lineId, { saving: true })
    try {
      const saved =
        change.kind === 'match'
          ? await client.matchLine(lineId, {
              version: before.version,
              chargeIds: change.charges.map((charge) => charge.id),
            })
          : await client.setLineState(lineId, {
              version: before.version,
              state: change.state,
              ...(change.reason ? { reason: change.reason } : {}),
            })
      replace(saved)
      setStatus(lineId)
      announce(`Line ${lineId} saved: ${describeLine(saved)}.`)
      options.onChanged?.()
    } catch (e) {
      replace(before) // roll back
      failed(lineId, change, toApiError(e))
    }
  }

  function failed(lineId: string, change: LineChange, err: ApiError): void {
    if (err.code === 'stale_version' && err.current) {
      setStatus(lineId, { conflict: { mine: change, theirs: err.current } })
      announce(`Line ${lineId} was changed by someone else. Choose Keep mine or Take theirs.`, 'assertive')
      return
    }
    if (err.code === 'batch_posted') {
      setStatus(lineId)
      announce('This batch was posted by someone else, so it is read-only now. Your change was not saved.', 'assertive')
      options.onBatchPosted?.()
      return
    }
    const fields = err.code === 'validation' ? err.fieldErrors : {}
    const details = Object.values(fields).flat()
    // With field errors the row lists them; otherwise say what went wrong (e.g. no connection).
    const message = details.length > 0 ? `Line ${lineId} was not saved.` : `Line ${lineId} was not saved. ${err.message}`
    setStatus(lineId, { error: { message, fields } })
    announce(details.length > 0 ? `${message} ${details.join(' ')}` : message, 'assertive')
  }

  /** Retry the user's change on top of the server's current line, sending its version. */
  function keepMine(lineId: string): Promise<void> {
    const conflict = rowStatus.get(lineId)?.conflict
    if (!conflict) return Promise.resolve()
    replace(conflict.theirs)
    setStatus(lineId)
    return write(lineId, conflict.mine)
  }

  /** Drop the user's change and show the server's current line. */
  function takeTheirs(lineId: string): void {
    const conflict = rowStatus.get(lineId)?.conflict
    if (!conflict) return
    replace(conflict.theirs)
    setStatus(lineId)
    announce(`Line ${lineId} now shows the current version: ${describeLine(conflict.theirs)}.`)
    options.onChanged?.()
  }

  watch(
    () => toValue(batchId),
    () => {
      data.value = []
      rowStatus.clear()
      void reload()
    },
    { immediate: true },
  )
  onScopeDispose(() => controller?.abort())

  return {
    data,
    loading,
    error,
    reload,
    rowStatus,
    match: (lineId: string, charges: Pick<Charge, 'id' | 'amount'>[]) =>
      write(lineId, { kind: 'match', charges }),
    changeState: (lineId: string, state: TargetState, reason?: string) =>
      write(lineId, { kind: 'state', state, ...(reason ? { reason } : {}) }),
    keepMine,
    takeTheirs,
    dismissError: (lineId: string) => setStatus(lineId),
  }
}
