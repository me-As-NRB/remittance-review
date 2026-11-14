import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick, shallowReactive, type ComponentPublicInstance } from 'vue'
import { makeLine } from '@/__tests__/fixtures'
import type { Line } from '@/batch/types'
import type { RowStatus } from '@/composables/useLines'
import { HTML_REMARK } from '@/mock/seed'
import LinesTable from '../LinesTable.vue'

const valid = makeLine({ id: 'L-6', paid: '200.00', billed: '500.00', adjustments: '300.00' })
const invalid = makeLine({ id: 'L-9', billed: '40.00', paid: '25.00', adjustments: '10.00' })
const withHtml = makeLine({ id: 'L-7', remark: HTML_REMARK })

function mountTable(lines: Line[], options: { readOnly?: boolean; rowStatus?: Map<string, RowStatus> } = {}) {
  return mount(LinesTable, {
    props: {
      lines,
      rowStatus: options.rowStatus ?? shallowReactive(new Map<string, RowStatus>()),
      readOnly: options.readOnly ?? false,
      caption: 'Lines',
    },
    attachTo: document.body,
  })
}
const rowOf = (wrapper: ReturnType<typeof mountTable>, id: string) =>
  wrapper.findAll('tr.line-row').find((row) => row.find('th').text() === id)!

describe('LinesTable', () => {
  it('shows the remark as plain text, never as HTML', () => {
    const wrapper = mountTable([withHtml])
    expect(wrapper.find('img').exists()).toBe(false)
    expect(rowOf(wrapper, 'L-7').find('.remark').text()).toBe(HTML_REMARK)
  })

  it('marks an invalid line with an icon and text, not colour alone', () => {
    const note = rowOf(mountTable([invalid]), 'L-9').find('.invalid-note')
    expect(note.find('[aria-hidden="true"]').text()).toBe('⚠')
    expect(note.text()).toContain('Invalid: billed $40.00 is not paid + adjustments ($35.00)')
  })

  it('disables what R1 forbids for an invalid line, pointing at the visible reason', () => {
    const row = rowOf(mountTable([invalid]), 'L-9')
    const noteId = row.find('.invalid-note').attributes('id')
    const buttons = Object.fromEntries(row.findAll('button').map((b) => [b.text().split(' ')[0], b]))

    for (const name of ['Match', 'Suspense', 'Unmatch']) {
      expect(buttons[name]?.attributes('disabled')).toBeDefined()
      expect(buttons[name]?.attributes('aria-describedby')).toBe(noteId)
    }
    expect(buttons['Exclude']?.attributes('disabled')).toBeUndefined()
  })

  it('emits the line id, and the button for focus to return to, when Match is pressed', async () => {
    const wrapper = mountTable([valid])
    const button = rowOf(wrapper, 'L-6').findAll('button')[0]!
    await button.trigger('click')
    expect(wrapper.emitted('match')).toEqual([['L-6', button.element]])
  })

  it('keeps a saving row focusable, ignoring presses until the save ends', async () => {
    const rowStatus = shallowReactive(new Map<string, RowStatus>([['L-6', { saving: true }]]))
    const wrapper = mountTable([valid], { rowStatus })
    const match = rowOf(wrapper, 'L-6').findAll('button')[0]!
    expect(match.attributes('disabled')).toBeUndefined()
    expect(match.attributes('aria-disabled')).toBe('true')
    await match.trigger('click')
    expect(wrapper.emitted('match')).toBeUndefined()
  })

  it('shows no actions when the batch is read-only', () => {
    const row = rowOf(mountTable([valid], { readOnly: true }), 'L-6')
    expect(row.findAll('button')).toHaveLength(0)
    expect(row.find('.actions').text()).toBe('Read-only')
  })

  it('shows a conflict next to the row and moves focus into it', async () => {
    const rowStatus = shallowReactive(new Map<string, RowStatus>())
    const wrapper = mountTable([valid], { rowStatus })
    rowOf(wrapper, 'L-6').findAll('button')[1]!.element.focus()

    const theirs = { ...valid, state: 'Suspense' as const, version: 2 }
    rowStatus.set('L-6', { conflict: { mine: { kind: 'state', state: 'Excluded', reason: 'Dup' }, theirs } })
    await nextTick()
    await nextTick()

    const panel = wrapper.find('.conflict')
    expect(panel.text()).toContain('Your change')
    expect(panel.text()).toContain('Exclude (reason: Dup)')
    expect(panel.text()).toContain('Now on the server (version 2)')
    expect(document.activeElement).toBe(panel.element)

    await panel.findAll('button').find((b) => b.text() === 'Keep mine')!.trigger('click')
    await panel.findAll('button').find((b) => b.text() === 'Take theirs')!.trigger('click')
    expect(wrapper.emitted('keepMine')).toEqual([['L-6']])
    expect(wrapper.emitted('takeTheirs')).toEqual([['L-6']])

    rowStatus.delete('L-6')
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(rowOf(wrapper, 'L-6').find('th').element)
    wrapper.unmount()
  })

  it('lists field errors next to the row', async () => {
    const rowStatus = shallowReactive(new Map<string, RowStatus>([
      ['L-6', { error: { message: 'Line L-6 was not saved.', fields: { reason: ['Enter a reason'] } } }],
    ]))
    const wrapper = mountTable([valid], { rowStatus })
    expect(wrapper.find('.row-error').text()).toContain('Enter a reason')
    await wrapper.find('.row-error button').trigger('click')
    expect(wrapper.emitted('dismissError')).toEqual([['L-6']])
  })

  it('re-renders only the changed row out of 500', async () => {
    let rowUpdates = 0
    const countRowUpdates = {
      updated(this: ComponentPublicInstance) {
        if ((this.$.type as { __name?: string }).__name === 'LineRow') rowUpdates++
      },
    }
    const lines = Array.from({ length: 500 }, (_, i) => makeLine({ id: `G-${String(i).padStart(3, '0')}` }))
    const rowStatus = shallowReactive(new Map<string, RowStatus>())
    const wrapper = mount(LinesTable, {
      props: { lines, rowStatus, readOnly: false, caption: 'Lines' },
      global: { mixins: [countRowUpdates] },
    })

    await wrapper.setProps({ lines: lines.map((line, i) => (i === 250 ? { ...line, state: 'Suspense' } : line)) })
    expect(rowUpdates).toBe(1)

    rowStatus.set('G-010', { saving: true })
    await nextTick()
    expect(rowUpdates).toBe(2)
  })
})
