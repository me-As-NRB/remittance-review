<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'

/**
 * A modal dialog that traps focus: Tab and Shift+Tab cycle inside it, Esc
 * closes it, and when it closes focus goes back to the element that opened it.
 */
const props = defineProps<{
  title: string
  /** Where focus returns on close; defaults to whatever had focus when the dialog opened. */
  returnFocusTo?: HTMLElement | null
}>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLElement | null>(null)
const titleId = useId()
let opener: HTMLElement | null = null

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(): HTMLElement[] {
  return dialog.value ? [...dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE)] : []
}

onMounted(async () => {
  opener = props.returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  await nextTick()
  const [first] = focusableElements()
  ;(first ?? dialog.value)?.focus()
})

onBeforeUnmount(() => {
  if (opener?.isConnected) opener.focus()
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const items = focusableElements()
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) {
    event.preventDefault()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="emit('close')">
    <div
      ref="dialog"
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <h2 :id="titleId" class="dialog-title">{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>
