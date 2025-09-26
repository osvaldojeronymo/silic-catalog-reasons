import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// vite.config.ts
export default defineConfig({
  base: '/silic-catalog-reasons/', // nome do repositório GitHub Pages
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})