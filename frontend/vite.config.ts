import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Os headers de segurança da Vercel (vercel.json) também valem no `vite preview`,
// onde rodam o E2E e as fotos do build: uma violação de CSP aparece antes do deploy.
// (Sem upgrade-insecure-requests: o preview é http://localhost.)
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const previewHeaders = Object.fromEntries(
  (vercel.headers.find(h => h.source === '/(.*)')?.headers ?? [])
    .map(h => [h.key, h.value.replace('; upgrade-insecure-requests', '')]),
)

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  preview: { headers: previewHeaders },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // Geração de PDF: sem pacote nomeado, fica no trecho carregado só quando alguém exporta
          if (/[\\/](jspdf|html2canvas|canvg|dompurify|fflate|core-js|rgbcolor|stackblur-canvas|svg-pathdata|raf|performance-now)[\\/]/.test(id)) return undefined
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('axios') || id.includes('dexie')) return 'vendor-http'
          if (id.includes('react') || id.includes('zustand')) return 'vendor-react'
          if (id.includes('workbox') || id.includes('vite-plugin-pwa')) return 'vendor-pwa'
          return 'vendor'
        },
      },
    },
  },
})
