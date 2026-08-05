import preact from '@preact/preset-vite'
import { defineConfig } from 'vitest/config'

// D5: hash routing means the SPA never shadows backend routes; the dev
// server proxies the API calls the browser makes against :1996.
const BACKEND_TARGET = 'http://localhost:1996'

export default defineConfig({
  plugins: [preact()],
  server: {
    proxy: {
      '/setup': BACKEND_TARGET,
      '/admin': BACKEND_TARGET,
      '/photos': BACKEND_TARGET
    }
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts']
  }
})
