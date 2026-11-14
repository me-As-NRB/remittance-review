import { getCurrentInstance, inject, type InjectionKey } from 'vue'
import { api, type ApiClient } from '@/api/client'

/** Lets tests (or another environment) provide a different API client to the component tree. */
export const apiClientKey: InjectionKey<ApiClient> = Symbol('apiClient')

/** The client to use: an explicit one, else the one provided to the component tree, else the app default. */
export function useApiClient(override?: ApiClient): ApiClient {
  if (override) return override
  return getCurrentInstance() ? inject(apiClientKey, api) : api
}
