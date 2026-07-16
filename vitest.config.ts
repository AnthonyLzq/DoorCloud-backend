import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

const src = (path: string) => resolve(__dirname, 'src', path)

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
