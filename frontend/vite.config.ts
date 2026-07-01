import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5175',
    },
  },
  build: {
    outDir: resolve(__dirname, '../backend/app/static'),
    emptyOutDir: true,
  },
})
