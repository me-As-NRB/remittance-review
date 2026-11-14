import { readonly, shallowRef } from 'vue'

export type Politeness = 'polite' | 'assertive'

interface Announcement {
  id: number
  text: string
}

let nextId = 0
const polite = shallowRef<Announcement>({ id: nextId, text: '' })
const assertive = shallowRef<Announcement>({ id: nextId, text: '' })

/**
 * Sends a message to the page's aria-live regions (rendered by LiveRegion).
 * Each message gets a new id, so even a repeated message is announced again.
 */
export function announce(text: string, politeness: Politeness = 'polite'): void {
  const target = politeness === 'polite' ? polite : assertive
  target.value = { id: ++nextId, text }
}

export function useAnnouncements() {
  return { polite: readonly(polite), assertive: readonly(assertive) }
}
