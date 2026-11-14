import { createRouter, createWebHistory } from 'vue-router'
import BatchReviewPage from '@/pages/BatchReviewPage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/batches/B-104' },
    { path: '/batches/:id', component: BatchReviewPage, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/batches/B-104' },
  ],
})

export default router
