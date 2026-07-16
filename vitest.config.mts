import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const configDir = dirname(fileURLToPath(import.meta.url))
const src = (path: string) => resolve(configDir, 'src', path)

export default defineConfig({
  resolve: {
    alias: {
      config: src('config'),
      database: src('database'),
      integrations: src('integrations'),
      lib: src('lib'),
      network: src('network'),
      schemas: src('schemas'),
      services: src('services'),
      utils: src('utils')
    }
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000
  }
})
