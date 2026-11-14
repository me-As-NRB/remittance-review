// @vitest-environment node
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mockControls, nextDelayMs } from '../controls'
import { createMockDb } from '../db'
import { createHandlers } from '../handlers'

const server = setupServer(...createHandlers(createMockDb()))
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  mockControls.delayMode = 'off'
  mockControls.failNext = null
})
afterAll(() => server.close())

const api = (path: string, init?: RequestInit) => fetch(`http://localhost/api${path}`, init)
const put = (path: string, body: string) =>
  api(path, { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } })

describe('mock API over HTTP', () => {
  it('serves the contract paths as JSON', async () => {
    const response = await api('/batches/B-104')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ id: 'B-104', canPost: false })
  })

  it('reads q and limit from the query string', async () => {
    const charges = (await (await api('/charges?q=C-504&limit=1')).json()) as { id: string }[]
    expect(charges.map((c) => c.id)).toEqual(['CH-41'])
  })

  it('answers errors as application/problem+json', async () => {
    const response = await put('/lines/L-6/match', JSON.stringify({ version: 1, chargeIds: [] }))
    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({ code: 'validation', status: 422 })
  })

  it('answers 400 for a body that is not JSON (R9)', async () => {
    const response = await put('/lines/L-6/match', '{not json')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ status: 400, code: 'validation' })
  })

  it('fails the next request only, when asked', async () => {
    mockControls.failNext = 'gateway'
    expect((await api('/batches/B-104')).status).toBe(502)
    expect((await api('/batches/B-104')).status).toBe(200)

    mockControls.failNext = 'network'
    await expect(api('/batches/B-104')).rejects.toThrow()
    expect(mockControls.failNext).toBeNull()
  })

  it('waits for the configured delay', async () => {
    vi.useFakeTimers()
    try {
      mockControls.delayMode = 'fixed'
      mockControls.fixedDelayMs = 1000
      let settled = false
      const request = api('/batches/B-104').then(() => (settled = true))
      await vi.advanceTimersByTimeAsync(999)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await request
      expect(settled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('delay switch', () => {
  it('picks random delays between 100 and 1500 ms', () => {
    mockControls.delayMode = 'random'
    expect(nextDelayMs(() => 0)).toBe(100)
    expect(nextDelayMs(() => 0.999999)).toBe(1500)
  })

  it('is zero when off', () => {
    mockControls.delayMode = 'off'
    expect(nextDelayMs()).toBe(0)
  })
})
