import type { Line } from '@/batch/types'

/** R10: every API error is application/problem+json with one of these stable codes. */
export type ProblemCode = 'not_found' | 'batch_posted' | 'stale_version' | 'validation'

export const PROBLEM_CODES: readonly ProblemCode[] = ['not_found', 'batch_posted', 'stale_version', 'validation']

export const PROBLEM_CONTENT_TYPE = 'application/problem+json'

export interface Problem {
  type: string
  title: string
  status: number
  code: ProblemCode
  /** Only on stale_version: the line exactly as GET returns it now. */
  current?: Line
  /** Only on validation: messages per field, e.g. { reason: ["Enter a reason"] }. */
  errors?: Record<string, string[]>
}
