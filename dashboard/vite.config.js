import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        home: resolve(root, 'index.html'),
        login: resolve(root, 'login/index.html'),
        register: resolve(root, 'register/index.html'),
        research: resolve(root, 'research/index.html'),
        account: resolve(root, 'account/index.html'),
        privacy: resolve(root, 'privacy/index.html'),
      },
    },
  },
})
