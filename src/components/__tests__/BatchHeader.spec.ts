import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { makeLine, makeSummary } from '@/__tests__/fixtures'
import BatchHeader from '../BatchHeader.vue'

const lines = [
  makeLine({ id: 'L-1', paid: '120.00', state: 'Matched' }),
  makeLine({ id: 'L-3', paid: '-200.00', state: 'Matched' }),
  makeLine({ id: 'L-7', paid: '50.00', state: 'Unmatched' }),
]

describe('BatchHeader', () => {
  it('shows the expected amount, totals per state and the signed difference', () => {
    const wrapper = mount(BatchHeader, {
      props: { batch: makeSummary({ expectedAmount: '0.00', canPost: false }), lines, syncing: false },
    })
    const metrics = Object.fromEntries(
      wrapper.findAll('.metric').map((m) => [m.find('dt').text(), m.find('dd').text()]),
    )
    expect(metrics).toEqual({
      Expected: '$0.00',
      Unmatched: '$50.00',
      Matched: '−$80.00',
      Suspense: '$0.00',
      Excluded: '$0.00',
      Difference: '−$80.00',
    })
  })

  it('lists every reason the batch is not ready', () => {
    const wrapper = mount(BatchHeader, {
      props: { batch: makeSummary({ expectedAmount: '100.00', canPost: false }), lines, syncing: false },
    })
    expect(wrapper.find('.readiness-title').text()).toContain('Not ready')
    expect(wrapper.findAll('.readiness li').map((li) => li.text())).toEqual([
      '1 line unmatched',
      'Totals differ by $180.00',
    ])
  })

  it('says Ready to post when everything is decided and adds up', () => {
    const decided = [makeLine({ paid: '100.00', state: 'Suspense' })]
    const wrapper = mount(BatchHeader, {
      props: { batch: makeSummary({ expectedAmount: '100.00', canPost: true }), lines: decided, syncing: false },
    })
    expect(wrapper.find('.readiness-title').text()).toContain('Ready to post')
    expect(wrapper.find('.server-mismatch').exists()).toBe(false)
  })

  it('flags a disagreement with the server once nothing is in flight', async () => {
    const decided = [makeLine({ paid: '100.00', state: 'Suspense' })]
    const wrapper = mount(BatchHeader, {
      props: { batch: makeSummary({ expectedAmount: '100.00', canPost: false }), lines: decided, syncing: true },
    })
    expect(wrapper.find('.server-mismatch').exists()).toBe(false)
    await wrapper.setProps({ syncing: false })
    expect(wrapper.find('.server-mismatch').text()).toContain('The server says this batch is not ready')
    await wrapper.find('.server-mismatch button').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })
})
