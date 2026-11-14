/**
 * Point the app at a real server that implements the section 3 contract with
 * VITE_API_BASE_URL (e.g. https://api.example.com). Without it, requests go to
 * /api on this origin and the built-in mock (MSW) answers them.
 */
const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

export const API_BASE_URL = configuredBaseUrl || '/api'
export const USE_MOCK_API = !configuredBaseUrl
