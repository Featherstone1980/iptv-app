import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // CRITICAL for Electron: use relative paths so assets load correctly via file:// protocol
  optimizeDeps: {
    include: ['react-window']
  }
})
