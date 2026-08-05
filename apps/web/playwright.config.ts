import { defineConfig } from '@playwright/test'

// E2E smoke suite for the DoorCloud SPA. The web server builds the app with
// `vite build` (tsc + vite) and serves the built `dist` with `vite preview` on
// the fixed port 4173. The tests stub the /setup, /admin and /photos APIs via
// page.route() so no backend, MQTT, models or WhatsApp are required; the SPA is
// exercised against a real browser DOM and a real build, not in-process.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173'
  },
  webServer: {
    command:
      'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})