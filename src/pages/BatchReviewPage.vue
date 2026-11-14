<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BatchHeader from '@/components/BatchHeader.vue'
import ExcludeDialog from '@/components/ExcludeDialog.vue'
import LinesTable from '@/components/LinesTable.vue'
import MatchDialog from '@/components/MatchDialog.vue'
import { filterLines, SORT_OPTIONS, sortLines, type SortKey, type StateFilter } from '@/batch/sorting'
import { LINE_STATES, type Charge, type Line, type LineState } from '@/batch/types'
import { useBatch } from '@/composables/useBatch'
import { useLines } from '@/composables/useLines'

/** The review screen at /batches/:id. */
const props = defineProps<{ id: string }>()

// The row buttons disappear when the batch turns read-only, so focus moves to the
// banner that explains why, instead of falling back to the top of the page.
const banner = ref<HTMLElement | null>(null)
let focusBannerWhenReadOnly = false

const { data: batch, loading: batchLoading, error: batchError, reload: reloadBatch } = useBatch(() => props.id)
const {
  data: lines,
  loading: linesLoading,
  error: linesError,
  reload: reloadLines,
  rowStatus,
  match,
  changeState,
  keepMine,
  takeTheirs,
  dismissError,
} = useLines(() => props.id, {
  // Refresh the server's totals and canPost after every confirmed write.
  onChanged: () => void reloadBatch(),
  // Someone posted the batch: reload it, which switches the screen to read-only.
  onBatchPosted: () => {
    focusBannerWhenReadOnly = true
    void reloadBatch()
    void reloadLines()
  },
})

const readOnly = computed(() => batch.value?.status === 'Posted')
const syncing = computed(
  () => batchLoading.value || linesLoading.value || [...rowStatus.values()].some((status) => status.saving),
)

const stateFilter = ref<StateFilter>('All')
const sortKey = ref<SortKey>('date-asc')
const visibleLines = computed(() => sortLines(filterLines(lines.value, stateFilter.value), sortKey.value))
const counts = computed(() => {
  const result = Object.fromEntries(LINE_STATES.map((state) => [state, 0])) as Record<LineState, number>
  for (const line of lines.value) result[line.state]++
  return result
})

type OpenDialog = { kind: 'match' | 'exclude'; line: Line; opener: HTMLElement | null }
const dialog = shallowRef<OpenDialog | null>(null)

function openDialog(kind: OpenDialog['kind'], lineId: string, opener: HTMLElement | null) {
  const line = lines.value.find((l) => l.id === lineId)
  if (line && !readOnly.value) dialog.value = { kind, line, opener }
}
const openMatch = (lineId: string, opener: HTMLElement | null) => openDialog('match', lineId, opener)
const openExclude = (lineId: string, opener: HTMLElement | null) => openDialog('exclude', lineId, opener)
const closeDialog = () => (dialog.value = null)

function confirmMatch(charges: Charge[]) {
  const lineId = dialog.value?.line.id
  closeDialog()
  if (lineId) void match(lineId, charges)
}
function confirmExclude(reason: string) {
  const lineId = dialog.value?.line.id
  closeDialog()
  if (lineId) void changeState(lineId, 'Excluded', reason)
}
const suspend = (lineId: string) => void changeState(lineId, 'Suspense')
const unmatch = (lineId: string) => void changeState(lineId, 'Unmatched')

function refresh() {
  void reloadBatch()
  void reloadLines()
}

// A dialog never outlives its batch, or the batch becoming read-only.
watch([() => props.id, readOnly], closeDialog)

watch(readOnly, async (isReadOnly) => {
  if (!isReadOnly || !focusBannerWhenReadOnly) return
  focusBannerWhenReadOnly = false
  await nextTick()
  banner.value?.focus()
})
</script>

<template>
  <div class="page">
    <p v-if="batchError?.code === 'not_found'" class="notice">
      Batch {{ id }} was not found. <RouterLink to="/batches/B-104">Open batch B-104</RouterLink>
    </p>
    <div v-else-if="batchError || linesError" class="notice error" role="alert">
      <p>Couldn't load batch {{ id }}. {{ (batchError ?? linesError)?.message }}</p>
      <button type="button" @click="refresh">Try again</button>
    </div>
    <p v-else-if="!batch" class="notice">Loading batch {{ id }}…</p>

    <template v-else>
      <BatchHeader :batch="batch" :lines="lines" :syncing="syncing" @refresh="refresh" />

      <p v-if="readOnly" ref="banner" class="banner" tabindex="-1">
        This batch is posted, so it is read-only: you can review it, but not change it.
      </p>

      <div class="toolbar">
        <label>
          Show
          <select v-model="stateFilter">
            <option value="All">All states ({{ lines.length }})</option>
            <option v-for="state in LINE_STATES" :key="state" :value="state">
              {{ state }} ({{ counts[state] }})
            </option>
          </select>
        </label>
        <label>
          Sort by
          <select v-model="sortKey">
            <option v-for="option in SORT_OPTIONS" :key="option.key" :value="option.key">{{ option.label }}</option>
          </select>
        </label>
        <span class="sub">Showing {{ visibleLines.length }} of {{ lines.length }} lines</span>
      </div>

      <p v-if="linesLoading && lines.length === 0" class="notice">Loading lines…</p>
      <LinesTable
        v-else
        :lines="visibleLines"
        :row-status="rowStatus"
        :read-only="readOnly"
        :caption="`Lines of batch ${id}`"
        @match="openMatch"
        @suspense="suspend"
        @exclude="openExclude"
        @unmatch="unmatch"
        @keep-mine="keepMine"
        @take-theirs="takeTheirs"
        @dismiss-error="dismissError"
      />

      <MatchDialog
        v-if="dialog?.kind === 'match'"
        :line="dialog.line"
        :return-focus-to="dialog.opener"
        @close="closeDialog"
        @confirm="confirmMatch"
      />
      <ExcludeDialog
        v-if="dialog?.kind === 'exclude'"
        :line="dialog.line"
        :return-focus-to="dialog.opener"
        @close="closeDialog"
        @confirm="confirmExclude"
      />
    </template>
  </div>
</template>
