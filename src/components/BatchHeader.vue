<script setup lang="ts">
import { computed } from 'vue'
import { readiness } from '@/batch/readiness'
import { totalsByState } from '@/batch/rules'
import { LINE_STATES, type BatchSummary, type Line } from '@/batch/types'
import { formatAmount, formatCents, parseCents } from '@/money/cents'

/**
 * Header (spec 4.1): recalculated from the lines on screen, in integer cents,
 * after every change, including optimistic ones. The server's canPost comes
 * with the batch; once nothing is in flight, the two must agree.
 */
const props = defineProps<{
  batch: BatchSummary
  lines: Line[]
  /** A write or a reload is in flight, so the server's canPost may be one step behind. */
  syncing: boolean
}>()
const emit = defineEmits<{ refresh: [] }>()

const totals = computed(() => totalsByState(props.lines))
const differenceCents = computed(
  () => totals.value.Matched + totals.value.Suspense + totals.value.Excluded - parseCents(props.batch.expectedAmount),
)
const result = computed(() => readiness(props.batch, props.lines))
const disagreesWithServer = computed(() => !props.syncing && result.value.ready !== props.batch.canPost)
</script>

<template>
  <section class="batch-header" aria-labelledby="batch-title">
    <div class="title-row">
      <h1 id="batch-title">Batch {{ batch.id }}</h1>
      <span class="badge" :class="batch.status === 'Posted' ? 'badge-posted' : 'badge-open'">{{ batch.status }}</span>
    </div>

    <dl class="metrics">
      <div class="metric">
        <dt>Expected</dt>
        <dd>{{ formatAmount(batch.expectedAmount) }}</dd>
      </div>
      <div v-for="state in LINE_STATES" :key="state" class="metric">
        <dt>{{ state }}</dt>
        <dd>{{ formatCents(totals[state]) }}</dd>
      </div>
      <div class="metric">
        <dt>Difference</dt>
        <dd>{{ formatCents(differenceCents) }}</dd>
        <dd class="sub">Matched + Suspense + Excluded − Expected</dd>
      </div>
    </dl>

    <div class="readiness" :class="result.ready ? 'is-ready' : 'not-ready'">
      <p class="readiness-title">
        <span aria-hidden="true">{{ result.ready ? '✓' : '✕' }}</span>
        {{ result.ready ? 'Ready to post' : 'Not ready' }}
      </p>
      <ul v-if="!result.ready">
        <li v-for="reason in result.reasons" :key="reason">{{ reason }}</li>
      </ul>
      <p v-if="disagreesWithServer" class="server-mismatch">
        The server says this batch is {{ batch.canPost ? 'ready' : 'not ready' }}, so another user may have
        changed it.
        <button type="button" @click="emit('refresh')">Reload batch</button>
      </p>
    </div>
  </section>
</template>
