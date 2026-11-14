<script setup lang="ts">
import type { Line } from '@/batch/types'
import type { RowStatus } from '@/composables/useLines'
import LineRow from './LineRow.vue'

defineProps<{ lines: Line[]; rowStatus: ReadonlyMap<string, RowStatus>; readOnly: boolean; caption: string }>()
const emit = defineEmits<{
  match: [lineId: string, opener: HTMLElement | null]
  suspense: [lineId: string]
  exclude: [lineId: string, opener: HTMLElement | null]
  unmatch: [lineId: string]
  keepMine: [lineId: string]
  takeTheirs: [lineId: string]
  dismissError: [lineId: string]
}>()

// Stable handler functions (not inline arrows in the template): every LineRow
// then gets the same props when another line changes, so only the row whose
// line changed re-renders, even with 500 lines.
const onMatch = (lineId: string, opener: HTMLElement | null) => emit('match', lineId, opener)
const onSuspense = (lineId: string) => emit('suspense', lineId)
const onExclude = (lineId: string, opener: HTMLElement | null) => emit('exclude', lineId, opener)
const onUnmatch = (lineId: string) => emit('unmatch', lineId)
const onKeepMine = (lineId: string) => emit('keepMine', lineId)
const onTakeTheirs = (lineId: string) => emit('takeTheirs', lineId)
const onDismissError = (lineId: string) => emit('dismissError', lineId)
</script>

<template>
  <div class="table-scroll">
    <table class="lines-table">
      <caption class="sr-only">{{ caption }}</caption>
      <thead>
        <tr>
          <th scope="col">Line</th>
          <th scope="col">Claim</th>
          <th scope="col">Code</th>
          <th scope="col">Date of service</th>
          <th scope="col" class="num">Billed</th>
          <th scope="col" class="num">Paid</th>
          <th scope="col" class="num">Adjustments</th>
          <th scope="col">State</th>
          <th scope="col">Remark</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        <LineRow
          v-for="line in lines"
          :key="line.id"
          :line="line"
          :status="rowStatus.get(line.id)"
          :read-only="readOnly"
          @match="onMatch"
          @suspense="onSuspense"
          @exclude="onExclude"
          @unmatch="onUnmatch"
          @keep-mine="onKeepMine"
          @take-theirs="onTakeTheirs"
          @dismiss-error="onDismissError"
        />
        <tr v-if="lines.length === 0">
          <td colspan="10" class="empty">No lines in this view.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
