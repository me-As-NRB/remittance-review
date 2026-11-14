import { reactive, watch } from 'vue'

/**
 * Switches for the mock API (spec 3.1): a configurable delay, including a
 * random 100–1500 ms mode to make races visible, and a way to make the next
 * request fail. Set them in the dev panel, or with URL parameters:
 * ?mockDelay=off|random|<ms> and ?mockFail=network|gateway.
 */
export type DelayMode = 'off' | 'fixed' | 'random'
/** network: the connection drops (fetch rejects). gateway: a 502 from in front of the API. */
export type FailureKind = 'network' | 'gateway'

export interface MockControls {
  delayMode: DelayMode
  fixedDelayMs: number
  failNext: FailureKind | null
}

export const RANDOM_DELAY_MS = { min: 100, max: 1500 } as const
const STORAGE_KEY = 'remittance-review:mock-delay'

export const mockControls = reactive<MockControls>(initialControls())

watch(
  () => [mockControls.delayMode, mockControls.fixedDelayMs] as const,
  ([delayMode, fixedDelayMs]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ delayMode, fixedDelayMs }))
    } catch {
      // Storage can be unavailable (private mode, tests); the setting just won't persist.
    }
  },
)

export function nextDelayMs(random: () => number = Math.random): number {
  switch (mockControls.delayMode) {
    case 'off':
      return 0
    case 'fixed':
      return mockControls.fixedDelayMs
    case 'random':
      return RANDOM_DELAY_MS.min + Math.floor(random() * (RANDOM_DELAY_MS.max - RANDOM_DELAY_MS.min + 1))
  }
}

/** Returns the failure armed for the next request, if any, and disarms it. */
export function takeFailure(): FailureKind | null {
  const failure = mockControls.failNext
  mockControls.failNext = null
  return failure
}

function initialControls(): MockControls {
  const controls: MockControls = { delayMode: 'off', fixedDelayMs: 400, failNext: null }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isSavedDelay(saved)) Object.assign(controls, saved)
  } catch {
    // No saved settings.
  }
  if (typeof location === 'undefined') return controls

  const params = new URLSearchParams(location.search)
  const delay = params.get('mockDelay')
  if (delay === 'off' || delay === 'random') controls.delayMode = delay
  else if (delay && /^\d+$/.test(delay)) {
    controls.delayMode = 'fixed'
    controls.fixedDelayMs = Number.parseInt(delay, 10)
  }
  const fail = params.get('mockFail')
  if (fail === 'network' || fail === 'gateway') controls.failNext = fail
  return controls
}

function isSavedDelay(value: unknown): value is Pick<MockControls, 'delayMode' | 'fixedDelayMs'> {
  if (typeof value !== 'object' || value === null) return false
  const { delayMode, fixedDelayMs } = value as Record<string, unknown>
  return (
    (delayMode === 'off' || delayMode === 'fixed' || delayMode === 'random') &&
    Number.isSafeInteger(fixedDelayMs)
  )
}
