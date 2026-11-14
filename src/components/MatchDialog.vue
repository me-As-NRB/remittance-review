<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Charge, Line } from '@/batch/types'
import { useChargeSearch } from '@/composables/useChargeSearch'
import { allocate } from '@/money/allocate'
import { formatAmount, formatCents, parseCents } from '@/money/cents'
import BaseDialog from './BaseDialog.vue'

/**
 * Match one line to one charge (simple match) or to several charges of the
 * same claim (split, with a live preview of each share). The preview calls the
 * same allocate() the server uses, so it matches the server to the cent.
 */
const props = defineProps<{ line: Line; returnFocusTo?: HTMLElement | null }>()
const emit = defineEmits<{ close: []; confirm: [charges: Charge[]] }>()

const { query, data: results, loading, error } = useChargeSearch({ initialQuery: props.line.claimId, limit: 50 })
const selected = ref<Charge[]>([])

const isSelected = (charge: Charge) => selected.value.some((c) => c.id === charge.id)
/** R4: every charge must be on the line's own claim. */
const isOnLineClaim = (charge: Charge) => charge.claimId === props.line.claimId

function toggle(charge: Charge) {
  selected.value = isSelected(charge)
    ? selected.value.filter((c) => c.id !== charge.id)
    : [...selected.value, charge]
}

const preview = computed(() => {
  if (selected.value.length === 0) return []
  const shares = allocate(
    parseCents(props.line.paid),
    selected.value.map((charge) => ({ id: charge.id, amountCents: parseCents(charge.amount) })),
  )
  return shares.map((share, index) => ({
    charge: selected.value[index],
    share: formatCents(share.amountCents),
  }))
})

const confirmLabel = computed(() => {
  const [only] = selected.value
  if (!only) return 'Select a charge'
  if (selected.value.length === 1) return `Match to ${only.id}`
  return `Split across ${selected.value.length} charges`
})

function confirm() {
  if (selected.value.length > 0) emit('confirm', [...selected.value])
}
</script>

<template>
  <BaseDialog :title="`Match line ${line.id}`" :return-focus-to="returnFocusTo" @close="emit('close')">
    <p class="dialog-summary">
      Claim <strong>{{ line.claimId }}</strong> · code {{ line.code }} · {{ line.dateOfService }} · paid
      <strong>{{ formatAmount(line.paid) }}</strong>
    </p>

    <label class="field">
      <span>Search charges by claim or code</span>
      <input v-model="query" type="search" autocomplete="off" spellcheck="false" />
    </label>
    <p class="hint">Pick one charge to match, or several on claim {{ line.claimId }} to split the payment.</p>

    <div class="search-status" aria-live="polite">
      <span v-if="loading">Searching…</span>
      <span v-else-if="error" class="error-text">Search failed: {{ error.message }}</span>
      <span v-else-if="query.trim() && results.length === 0">No charges match “{{ query.trim() }}”.</span>
    </div>

    <ul v-if="results.length > 0" class="charge-results" aria-label="Charges">
      <li v-for="charge in results" :key="charge.id">
        <label class="charge-option" :class="{ unavailable: !isOnLineClaim(charge) }">
          <input
            type="checkbox"
            :checked="isSelected(charge)"
            :disabled="!isOnLineClaim(charge)"
            :aria-describedby="isOnLineClaim(charge) ? undefined : `other-claim-${charge.id}`"
            @change="toggle(charge)"
          />
          <span class="charge-id">{{ charge.id }}</span>
          <span>{{ charge.claimId }} · {{ charge.code }} · {{ charge.dateOfService }}</span>
          <span class="num">{{ formatAmount(charge.amount) }}</span>
        </label>
        <p v-if="!isOnLineClaim(charge)" :id="`other-claim-${charge.id}`" class="hint indent">
          Different claim: this line can only be matched to charges on claim {{ line.claimId }}.
        </p>
      </li>
    </ul>

    <section v-if="preview.length > 0" class="preview" aria-labelledby="split-preview-title">
      <h3 id="split-preview-title">{{ preview.length > 1 ? 'Split preview' : 'Match preview' }}</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Charge</th>
            <th scope="col" class="num">Charge amount</th>
            <th scope="col" class="num">Gets</th>
            <th scope="col"><span class="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in preview" :key="row.charge?.id">
            <th scope="row">{{ row.charge?.id }}</th>
            <td class="num">{{ row.charge ? formatAmount(row.charge.amount) : '' }}</td>
            <td class="num">{{ row.share }}</td>
            <td>
              <button v-if="row.charge" type="button" class="link" @click="toggle(row.charge)">
                Remove<span class="sr-only"> {{ row.charge.id }}</span>
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td></td>
            <td class="num">{{ formatAmount(line.paid) }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </section>

    <div class="dialog-actions">
      <button type="button" @click="emit('close')">Cancel</button>
      <button type="button" class="primary" :disabled="selected.length === 0" @click="confirm">
        {{ confirmLabel }}
      </button>
    </div>
  </BaseDialog>
</template>
