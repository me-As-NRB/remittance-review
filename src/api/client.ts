import type { BatchSummary, Charge, Line, TargetState } from '@/batch/types'
import { API_BASE_URL } from './config'
import { PROBLEM_CODES, PROBLEM_CONTENT_TYPE, type Problem, type ProblemCode } from './problem'

/** An R10 code, or what went wrong outside the API contract (no connection, an unexpected answer). */
export type ApiErrorCode = ProblemCode | 'network' | 'unexpected'

/** Every failed request becomes an ApiError. Branch on `code`, never on the message or title. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    /** HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
    message: string,
    readonly problem?: Problem,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** stale_version: the line as the server has it now. */
  get current(): Line | undefined {
    return this.problem?.current
  }

  /** validation: messages per field. */
  get fieldErrors(): Record<string, string[]> {
    return this.problem?.errors ?? {}
  }
}

export interface MatchRequest {
  version: number
  chargeIds: string[]
}

export interface StateRequest {
  version: number
  state: TargetState
  reason?: string
}

/** The only way components reach the API. Every method takes an AbortSignal for cancellation. */
export interface ApiClient {
  getBatch(id: string, signal?: AbortSignal): Promise<BatchSummary>
  getLines(batchId: string, signal?: AbortSignal): Promise<Line[]>
  searchCharges(q: string, options?: { limit?: number; signal?: AbortSignal }): Promise<Charge[]>
  matchLine(lineId: string, body: MatchRequest, signal?: AbortSignal): Promise<Line>
  setLineState(lineId: string, body: StateRequest, signal?: AbortSignal): Promise<Line>
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export function createApiClient({
  baseUrl = API_BASE_URL,
  // Looked up on every call, so test tools that replace fetch are picked up.
  fetch: fetchImpl = (input, init) => globalThis.fetch(input, init),
}: { baseUrl?: string; fetch?: Fetch } = {}): ApiClient {
  async function request<T>(
    method: 'GET' | 'PUT',
    path: string,
    { body, signal }: { body?: unknown; signal?: AbortSignal } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ApiError('network', 0, "Couldn't reach the server. Check your connection and try again.")
    }
    if (!response.ok) throw await readError(response)
    return (await response.json()) as T
  }

  const segment = encodeURIComponent
  return {
    getBatch: (id, signal) => request('GET', `/batches/${segment(id)}`, { signal }),
    getLines: (batchId, signal) => request('GET', `/batches/${segment(batchId)}/lines`, { signal }),
    searchCharges: (q, { limit, signal } = {}) => {
      const query = new URLSearchParams({ q })
      if (limit !== undefined) query.set('limit', String(limit))
      return request('GET', `/charges?${query}`, { signal })
    },
    matchLine: (lineId, body, signal) => request('PUT', `/lines/${segment(lineId)}/match`, { body, signal }),
    setLineState: (lineId, body, signal) => request('PUT', `/lines/${segment(lineId)}/state`, { body, signal }),
  }
}

/** The client the app uses, aimed at API_BASE_URL. */
export const api = createApiClient()

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

/** Normalises anything thrown by a request into an ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError('unexpected', 0, 'Something went wrong. Try again.')
}

async function readError(response: Response): Promise<ApiError> {
  if (response.headers.get('content-type')?.includes(PROBLEM_CONTENT_TYPE)) {
    const body: unknown = await response.json().catch(() => undefined)
    if (isProblem(body)) return new ApiError(body.code, response.status, body.title, body)
  }
  return new ApiError('unexpected', response.status, `The server answered ${response.status}. Try again in a moment.`)
}

function isProblem(body: unknown): body is Problem {
  if (typeof body !== 'object' || body === null) return false
  const { code, status, title } = body as Record<string, unknown>
  return (
    typeof status === 'number' &&
    typeof title === 'string' &&
    PROBLEM_CODES.some((known) => known === code)
  )
}
