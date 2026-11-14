import { delay, http, HttpResponse, type JsonBodyType } from 'msw'
import { PROBLEM_CONTENT_TYPE } from '@/api/problem'
import { nextDelayMs, takeFailure } from './controls'
import { problem, type MockDb, type MockResponse } from './db'

/** Matches the default API base URL "/api" on any origin. */
const API = '*/api'

/** MSW routes for the API contract in spec 3. Each one hands the request to the mock db. */
export function createHandlers(db: MockDb) {
  return [
    http.get(`${API}/batches/:id`, ({ params }) => serve(() => db.getBatch(String(params.id)))),
    http.get(`${API}/batches/:id/lines`, ({ params }) => serve(() => db.getLines(String(params.id)))),
    http.get(`${API}/charges`, ({ request }) => {
      const query = new URL(request.url).searchParams
      return serve(() => db.searchCharges(query.get('q'), query.get('limit')))
    }),
    http.put(`${API}/lines/:id/match`, ({ params, request }) =>
      serve(() => withJsonBody(request, (body) => db.matchLine(String(params.id), body))),
    ),
    http.put(`${API}/lines/:id/state`, ({ params, request }) =>
      serve(() => withJsonBody(request, (body) => db.setLineState(String(params.id), body))),
    ),
  ]
}

/** Applies the delay and failure switches, then answers with JSON (problem+json for errors). */
async function serve(handle: () => MockResponse | Promise<MockResponse>): Promise<Response> {
  const wait = nextDelayMs()
  if (wait > 0) await delay(wait)

  const failure = takeFailure()
  if (failure === 'network') return HttpResponse.error()
  if (failure === 'gateway') {
    return new HttpResponse('Bad Gateway (simulated)', { status: 502, headers: { 'Content-Type': 'text/plain' } })
  }

  const { status, body } = await handle()
  return HttpResponse.json(body as JsonBodyType, {
    status,
    headers: status >= 400 ? { 'Content-Type': PROBLEM_CONTENT_TYPE } : {},
  })
}

/** R9: a body that is not JSON gets a 400 before any other check. */
async function withJsonBody(request: Request, handle: (body: unknown) => MockResponse): Promise<MockResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return problem(400, 'validation', 'The request body is not valid JSON', {
      errors: { body: ['Send a valid JSON body'] },
    })
  }
  return handle(body)
}
