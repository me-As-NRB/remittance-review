<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { mockDb } from '@/mock/browser'
import { mockControls, RANDOM_DELAY_MS } from '@/mock/controls'

/** Switches for the mock API (spec 3.1). Only loaded when the mock is in use. */
const route = useRoute()
const lineId = ref('L-6')
const message = ref('')

function changeLine() {
  const changed = mockDb.simulateOtherUser(lineId.value.trim())
  message.value = changed
    ? `Another user moved ${changed.id} to ${changed.state}. Your next change to it will conflict.`
    : `No line ${lineId.value} in an open batch.`
}

function postBatch() {
  const batchId = String(route.params.id ?? '')
  message.value = mockDb.simulatePosting(batchId)
    ? `Another user posted ${batchId}. Your next change will be refused.`
    : 'Open a batch first.'
}
</script>

<template>
  <details class="dev-panel">
    <summary>Mock API controls</summary>
    <fieldset>
      <legend>Delay</legend>
      <label><input v-model="mockControls.delayMode" type="radio" value="off" /> Off</label>
      <label>
        <input v-model="mockControls.delayMode" type="radio" value="fixed" /> Fixed
        <input
          v-model.number="mockControls.fixedDelayMs"
          type="number"
          min="0"
          step="100"
          aria-label="Fixed delay in milliseconds"
        />
        ms
      </label>
      <label>
        <input v-model="mockControls.delayMode" type="radio" value="random" />
        Random {{ RANDOM_DELAY_MS.min }}–{{ RANDOM_DELAY_MS.max }} ms
      </label>
    </fieldset>
    <fieldset>
      <legend>Fail the next request</legend>
      <button type="button" @click="mockControls.failNext = 'network'">Drop the connection</button>
      <button type="button" @click="mockControls.failNext = 'gateway'">Answer 502</button>
      <p class="sub">
        {{ mockControls.failNext ? `Armed: the next request fails (${mockControls.failNext}).` : 'Nothing armed.' }}
      </p>
    </fieldset>
    <fieldset>
      <legend>Another user</legend>
      <label>Line <input v-model="lineId" size="6" /></label>
      <button type="button" @click="changeLine">Changes this line</button>
      <button type="button" @click="postBatch">Posts this batch</button>
      <p class="sub" aria-live="polite">{{ message }}</p>
    </fieldset>
    <p class="sub">The mock keeps data in memory: reloading the page resets it.</p>
  </details>
</template>
