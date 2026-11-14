import { createApp } from 'vue'
import { USE_MOCK_API } from './api/config'
import App from './App.vue'
import router from './router'
import './styles.css'

async function start() {
  // Without VITE_API_BASE_URL, MSW answers the API from an in-memory mock.
  if (USE_MOCK_API) {
    const { worker } = await import('./mock/browser')
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
  }
  createApp(App).use(router).mount('#app')
}

void start()
