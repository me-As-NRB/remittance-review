<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { USE_MOCK_API } from '@/api/config'
import LiveRegion from '@/components/LiveRegion.vue'

// The mock's control panel is only loaded when the mock answers the API.
const DevPanel = USE_MOCK_API ? defineAsyncComponent(() => import('@/components/DevPanel.vue')) : null
</script>

<template>
  <a class="skip-link" href="#main">Skip to the batch</a>
  <header class="app-header">
    <span class="brand">Remittance review</span>
    <nav aria-label="Batches">
      <RouterLink to="/batches/B-104">B-104</RouterLink>
      <RouterLink to="/batches/B-500">B-500 (500 lines)</RouterLink>
      <RouterLink to="/batches/B-099">B-099 (posted)</RouterLink>
    </nav>
  </header>
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
  <LiveRegion />
  <component :is="DevPanel" v-if="DevPanel" />
</template>
