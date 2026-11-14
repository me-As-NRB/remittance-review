<script setup lang="ts">
import { useAnnouncements } from '@/composables/useAnnouncer'

/** Screen-reader announcements for saves, conflicts and errors (spec 4.4). */
const { polite, assertive } = useAnnouncements()
</script>

<template>
  <div class="sr-only" aria-live="polite" aria-atomic="true">
    <p :key="polite.id">{{ polite.text }}</p>
  </div>
  <div class="sr-only" aria-live="assertive" aria-atomic="true">
    <p :key="assertive.id">{{ assertive.text }}</p>
  </div>
</template>
