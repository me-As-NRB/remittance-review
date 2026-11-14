import { setupWorker } from 'msw/browser'
import { createMockDb } from './db'
import { createHandlers } from './handlers'

/** The single in-memory database behind the browser mock; the dev panel also uses it. */
export const mockDb = createMockDb()

export const worker = setupWorker(...createHandlers(mockDb))
