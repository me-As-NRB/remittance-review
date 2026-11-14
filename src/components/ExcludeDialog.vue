<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Line } from '@/batch/types'
import BaseDialog from './BaseDialog.vue'

/** Exclude asks for a reason: required, 1–200 characters (spec 3, PUT /lines/{id}/state). */
const MAX_LENGTH = 200

defineProps<{ line: Line; returnFocusTo?: HTMLElement | null }>()
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()

const reason = ref('')
const submitted = ref(false)
const trimmed = computed(() => reason.value.trim())
const problem = computed(() => {
  if (!trimmed.value) return 'Enter a reason for excluding this line.'
  if (trimmed.value.length > MAX_LENGTH) return `Keep the reason to ${MAX_LENGTH} characters or fewer.`
  return ''
})

function confirm() {
  submitted.value = true
  if (!problem.value) emit('confirm', trimmed.value)
}
</script>

<template>
  <BaseDialog :title="`Exclude line ${line.id}`" :return-focus-to="returnFocusTo" @close="emit('close')">
    <form novalidate @submit.prevent="confirm">
      <label class="field">
        <span>Reason</span>
        <textarea
          v-model="reason"
          rows="3"
          :maxlength="MAX_LENGTH"
          aria-describedby="exclude-reason-help exclude-reason-error"
          :aria-invalid="submitted && !!problem"
        ></textarea>
      </label>
      <p id="exclude-reason-help" class="hint">{{ trimmed.length }}/{{ MAX_LENGTH }} characters</p>
      <p id="exclude-reason-error" class="error-text" aria-live="polite">{{ submitted ? problem : '' }}</p>
      <div class="dialog-actions">
        <button type="button" @click="emit('close')">Cancel</button>
        <button type="submit" class="primary">Exclude line</button>
      </div>
    </form>
  </BaseDialog>
</template>
