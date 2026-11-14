<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { describeChange, describeLine } from '@/batch/changes'
import { isValidLine } from '@/batch/rules'
import type { Line } from '@/batch/types'
import type { RowStatus } from '@/composables/useLines'
import { formatAmount, formatCents, parseCents } from '@/money/cents'

const props = defineProps<{ line: Line; status?: RowStatus; readOnly: boolean }>()
const emit = defineEmits<{
  match: [lineId: string, opener: HTMLElement | null]
  suspense: [lineId: string]
  exclude: [lineId: string, opener: HTMLElement | null]
  unmatch: [lineId: string]
  keepMine: [lineId: string]
  takeTheirs: [lineId: string]
  dismissError: [lineId: string]
}>()

const valid = computed(() => isValidLine(props.line))
const saving = computed(() => props.status?.saving === true)
const conflict = computed(() => props.status?.conflict)
const error = computed(() => props.status?.error)
const fieldMessages = computed(() => Object.values(error.value?.fields ?? {}).flat())
const invalidNoteId = computed(() => `invalid-note-${props.line.id}`)
const paidPlusAdjustments = computed(() =>
  formatCents(parseCents(props.line.paid) + parseCents(props.line.adjustments)),
)

const row = ref<HTMLElement | null>(null)
const rowHeader = ref<HTMLElement | null>(null)
const conflictPanel = ref<HTMLElement | null>(null)

// Keep focus with this line: into the conflict panel when it opens (if the user
// was working on this row), and back to the row when the panel closes.
watch(conflict, async (current, previous) => {
  const active = document.activeElement
  const wasHere = active === document.body || (active !== null && row.value?.contains(active) === true)
  await nextTick()
  if (current && wasHere) conflictPanel.value?.focus()
  else if (!current && previous && (document.activeElement === document.body || !document.activeElement)) {
    rowHeader.value?.focus()
  }
})

const opener = (event: Event) => (event.currentTarget instanceof HTMLElement ? event.currentTarget : null)

// R1-forbidden actions use `disabled`: they never become allowed. Actions that are
// only unavailable for now (saving, or the line is already in that state) use
// aria-disabled instead, so the button the user just pressed keeps focus.
const isSuspended = computed(() => props.line.state === 'Suspense')
const isUnmatched = computed(() => props.line.state === 'Unmatched')

function onMatch(event: Event) {
  if (!saving.value) emit('match', props.line.id, opener(event))
}
function onSuspense() {
  if (!saving.value && !isSuspended.value) emit('suspense', props.line.id)
}
function onExclude(event: Event) {
  if (!saving.value) emit('exclude', props.line.id, opener(event))
}
function onUnmatch() {
  if (!saving.value && !isUnmatched.value) emit('unmatch', props.line.id)
}
</script>

<template>
  <tr ref="row" class="line-row" :class="{ invalid: !valid, saving }" :aria-busy="saving">
    <th ref="rowHeader" scope="row" tabindex="-1">{{ line.id }}</th>
    <td>{{ line.claimId }}</td>
    <td>
      {{ line.code }}
      <span v-if="line.originalCode" class="sub">billed as {{ line.originalCode }}</span>
    </td>
    <td class="nowrap">{{ line.dateOfService }}</td>
    <td class="num">{{ formatAmount(line.billed) }}</td>
    <td class="num">{{ formatAmount(line.paid) }}</td>
    <td class="num">{{ formatAmount(line.adjustments) }}</td>
    <td class="state-cell">
      <span class="badge" :class="`badge-${line.state.toLowerCase()}`">{{ line.state }}</span>
      <span v-if="saving" class="sub">Saving…</span>
      <ul v-if="line.allocations.length > 0" class="allocations">
        <li v-for="allocation in line.allocations" :key="allocation.chargeId">
          {{ allocation.chargeId }} {{ formatAmount(allocation.amount) }}
        </li>
      </ul>
      <span v-if="line.reason" class="sub">Reason: {{ line.reason }}</span>
      <p v-if="!valid" :id="invalidNoteId" class="invalid-note">
        <span aria-hidden="true">⚠</span>
        Invalid: billed {{ formatAmount(line.billed) }} is not paid + adjustments ({{ paidPlusAdjustments }}).
        Only Exclude is allowed.
      </p>
    </td>
    <!-- The insurer's remark is untrusted text: rendered with {{ }} so any HTML shows as text. -->
    <td class="remark">{{ line.remark }}</td>
    <td class="actions">
      <span v-if="readOnly" class="sub">Read-only</span>
      <template v-else>
        <button
          type="button"
          :disabled="!valid"
          :aria-disabled="saving"
          :aria-describedby="valid ? undefined : invalidNoteId"
          @click="onMatch"
        >
          Match<span class="sr-only"> line {{ line.id }}</span>…
        </button>
        <button
          type="button"
          :disabled="!valid"
          :aria-disabled="saving || isSuspended"
          :aria-describedby="valid ? undefined : invalidNoteId"
          @click="onSuspense"
        >
          Suspense<span class="sr-only"> line {{ line.id }}</span>
        </button>
        <button type="button" :aria-disabled="saving" @click="onExclude">
          Exclude<span class="sr-only"> line {{ line.id }}</span>…
        </button>
        <button
          type="button"
          :disabled="!valid"
          :aria-disabled="saving || isUnmatched"
          :aria-describedby="valid ? undefined : invalidNoteId"
          @click="onUnmatch"
        >
          Unmatch<span class="sr-only"> line {{ line.id }}</span>
        </button>
      </template>
    </td>
  </tr>
  <tr v-if="conflict || error" class="row-details">
    <td colspan="10">
      <div
        v-if="conflict"
        ref="conflictPanel"
        class="conflict"
        tabindex="-1"
        role="group"
        :aria-label="`Conflict on line ${line.id}`"
      >
        <p class="panel-title">Someone else changed line {{ line.id }} before your change was saved.</p>
        <dl class="compare">
          <div>
            <dt>Your change</dt>
            <dd>{{ describeChange(conflict.mine) }}</dd>
          </div>
          <div>
            <dt>Now on the server (version {{ conflict.theirs.version }})</dt>
            <dd>{{ describeLine(conflict.theirs) }}</dd>
          </div>
        </dl>
        <button type="button" class="primary" @click="emit('keepMine', line.id)">Keep mine</button>
        <button type="button" @click="emit('takeTheirs', line.id)">Take theirs</button>
      </div>
      <div v-else-if="error" class="row-error" role="group" :aria-label="`Error on line ${line.id}`">
        <p class="panel-title"><span aria-hidden="true">⚠</span> {{ error.message }}</p>
        <ul v-if="fieldMessages.length > 0">
          <li v-for="message in fieldMessages" :key="message">{{ message }}</li>
        </ul>
        <button type="button" @click="emit('dismissError', line.id)">Dismiss</button>
      </div>
    </td>
  </tr>
</template>
