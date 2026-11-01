import { rmSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

const dbDir = '.gates-db/int'
rmSync(dbDir, { force: true, recursive: true })

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    env: { WEBEND_DB_DIR: dbDir },
    environment: 'jsdom',
    fileParallelism: false,
    hookTimeout: 120000,
    include: ['tests/int/**/*.int.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 60000,
  },
})
