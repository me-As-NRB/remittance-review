import { describe, expect, it, vi } from 'vitest'
import { makeLine } from '@/__tests__/fixtures'
import { ApiError, createApiClient } from '../client'

type FetchCall = [input: string, init: RequestInit]

function respondWith(response: Response | Error | DOMException) {
  const fetch = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  )
  return { client: createApiClient({ baseUrl: 'https://api.test', fetch }), fetch }
}
const json = (body: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } })
const problemJson = (body: Record<string, unknown>) => json(body, Number(body.status), 'application/problem+json')

describe('ApiClient requests', () => {
  it('GETs a batch from the contract path', async () => {
    const { client, fetch } = respondWith(json({ id: 'B-104' }))
    await expect(client.getBatch('B-104')).resolves.toEqual({ id: 'B-104' })
    const [url, init] = fetch.mock.calls[0] as FetchCall
    expect(url).toBe('https://api.test/batches/B-104')
    expect(init).toMatchObject({ method: 'GET', headers: { Accept: 'application/json' } })
  })

  it('encodes the search text and limit in the query string', async () => {
    const { client, fetch } = respondWith(json([]))
    await client.searchCharges('C 5&x', { limit: 50 })
    expect((fetch.mock.calls[0] as FetchCall)[0]).toBe('https://api.test/charges?q=C+5%26x&limit=50')
  })

  it('PUTs a match with a JSON body and passes the abort signal through', async () => {
    const { client, fetch } = respondWith(json(makeLine()))
    const controller = new AbortController()
    await client.matchLine('L-6', { version: 3, chargeIds: ['CH-41', 'CH-42'] }, controller.signal)
    const [url, init] = fetch.mock.calls[0] as FetchCall
    expect(url).toBe('https://api.test/lines/L-6/match')
    expect(init).toMatchObject({ method: 'PUT', signal: controller.signal })
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({ version: 3, chargeIds: ['CH-41', 'CH-42'] })
  })
})

describe('ApiClient errors', () => {
  it('turns 409 stale_version into an ApiError carrying the current line', async () => {
    const current = makeLine({ version: 4 })
    const { client } = respondWith(
      problemJson({ type: '/problems/stale-version', title: 'Changed', status: 409, code: 'stale_version', current }),
    )
    const error = await client.matchLine('L-1', { version: 3, chargeIds: ['CH-1'] }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'stale_version', status: 409, current })
  })

  it('exposes validation errors per field', async () => {
    const errors = { reason: ['Enter a reason'] }
    const { client } = respondWith(problemJson({ type: '/x', title: 'Invalid', status: 422, code: 'validation', errors }))
    const error = await client.setLineState('L-1', { version: 1, state: 'Excluded' }).catch((e: unknown) => e)
    expect((error as ApiError).fieldErrors).toEqual(errors)
  })

  it('branches on code, whatever the title says', async () => {
    const { client } = respondWith(
      problemJson({ type: '/x', title: 'Line not found (wrong title)', status: 409, code: 'batch_posted' }),
    )
    await expect(client.getLines('B-1')).rejects.toMatchObject({ code: 'batch_posted' })
  })

  it('treats a problem with an unknown code as unexpected', async () => {
    const { client } = respondWith(problemJson({ type: '/x', title: 'Teapot', status: 418, code: 'teapot' }))
    await expect(client.getLines('B-1')).rejects.toMatchObject({ code: 'unexpected', status: 418 })
  })

  it('treats a non-JSON error page as unexpected', async () => {
    const { client } = respondWith(new Response('Bad Gateway', { status: 502, headers: { 'Content-Type': 'text/plain' } }))
    await expect(client.getBatch('B-1')).rejects.toMatchObject({ code: 'unexpected', status: 502 })
  })

  it('turns a failed connection into a network error', async () => {
    const { client } = respondWith(new TypeError('Failed to fetch'))
    await expect(client.getBatch('B-1')).rejects.toMatchObject({ code: 'network', status: 0 })
  })

  it('rethrows an abort as-is, so callers can ignore it', async () => {
    const { client } = respondWith(new DOMException('Aborted', 'AbortError'))
    await expect(client.getBatch('B-1')).rejects.toMatchObject({ name: 'AbortError' })
  })
})
