import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, makeCharge, makeLine } from '@/__tests__/fixtures'
import type { ApiClient } from '@/api/client'
import type { Charge } from '@/batch/types'
import { apiClientKey } from '@/composables/useApiClient'
import { SEARCH_DEBOUNCE_MS } from '@/composables/useChargeSearch'
import MatchDialog from '../MatchDialog.vue'

const L6 = makeLine({ id: 'L-6', claimId: 'C-504', billed: '500.00', paid: '200.00', adjustments: '300.00' })
const CHARGES: Charge[] = [
  makeCharge({ id: 'CH-41', claimId: 'C-504', amount: '250.00' }),
  makeCharge({ id: 'CH-42', claimId: 'C-504', amount: '250.00' }),
  makeCharge({ id: 'CH-50', claimId: 'C-505', amount: '95.00' }),
]

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

async function open(line = L6, charges = CHARGES) {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const searchCharges = vi.fn<ApiClient['searchCharges']>().mockResolvedValue(charges)
  const wrapper = mount(MatchDialog, {
    props: { line, returnFocusTo: opener },
    attachTo: document.body,
    global: { provide: { [apiClientKey as symbol]: fakeClient({ searchCharges }) } },
  })
  await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
  await flushPromises()
  const checkbox = (id: string) =>
    wrapper.findAll('.charge-option').find((option) => option.find('.charge-id').text() === id)!.find('input')
  return { wrapper, opener, searchCharges, checkbox }
}

describe('MatchDialog', () => {
  it('searches charges for the line claim and only allows charges on that claim', async () => {
    const { searchCharges, checkbox, wrapper } = await open()
    expect(searchCharges).toHaveBeenCalledWith('C-504', expect.objectContaining({ limit: 50 }))
    expect(checkbox('CH-41').attributes('disabled')).toBeUndefined()
    expect(checkbox('CH-50').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('this line can only be matched to charges on claim C-504')
  })

  it('previews an even split exactly as the server computes it', async () => {
    const { checkbox, wrapper } = await open()
    await checkbox('CH-41').setValue(true)
    await checkbox('CH-42').setValue(true)
    const shares = wrapper.findAll('.preview tbody tr').map((row) => row.findAll('th, td').map((c) => c.text()))
    expect(shares.map(([id, , share]) => [id, share])).toEqual([
      ['CH-41', '$100.00'],
      ['CH-42', '$100.00'],
    ])
    expect(wrapper.find('.dialog-actions .primary').text()).toBe('Split across 2 charges')
  })

  it('previews the leftover cent going to the largest charge', async () => {
    const line = makeLine({ id: 'L-X', claimId: 'C-1', billed: '100.01', paid: '100.01', adjustments: '0.00' })
    const charges = [
      makeCharge({ id: 'CH-2', claimId: 'C-1', amount: '40.00' }),
      makeCharge({ id: 'CH-1', claimId: 'C-1', amount: '60.00' }),
    ]
    const { checkbox, wrapper } = await open(line, charges)
    await checkbox('CH-2').setValue(true)
    await checkbox('CH-1').setValue(true)
    const shares = wrapper.findAll('.preview tbody tr').map((row) => row.findAll('th, td').map((c) => c.text()))
    expect(shares.map(([id, , share]) => [id, share])).toEqual([
      ['CH-2', '$40.00'],
      ['CH-1', '$60.01'],
    ])
  })

  it('confirms with the selected charges', async () => {
    const { checkbox, wrapper } = await open()
    await checkbox('CH-42').setValue(true)
    expect(wrapper.find('.dialog-actions .primary').text()).toBe('Match to CH-42')
    await wrapper.find('.dialog-actions .primary').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[[CHARGES[1]]]])
  })

  it('focuses the search box when it opens', async () => {
    const { wrapper } = await open()
    expect(document.activeElement).toBe(wrapper.find('input[type="search"]').element)
  })

  it('closes on Esc', async () => {
    const { wrapper } = await open()
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('traps focus: Tab from the last control wraps to the first, Shift+Tab wraps back', async () => {
    const { wrapper } = await open()
    const dialog = wrapper.find('[role="dialog"]')
    const search = wrapper.find('input[type="search"]').element as HTMLElement
    const cancel = wrapper.findAll('.dialog-actions button')[0]!.element as HTMLElement
    // The confirm button is disabled until a charge is picked, so Cancel is the last control.
    cancel.focus()
    await dialog.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(search)
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)
  })

  it('returns focus to the button that opened it', async () => {
    const { wrapper, opener } = await open()
    wrapper.unmount()
    expect(document.activeElement).toBe(opener)
  })
})
