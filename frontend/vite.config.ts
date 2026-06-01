import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('axios') || id.includes('dexie')) return 'vendor-http'
          if (id.includes('react') || id.includes('zustand')) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
})
