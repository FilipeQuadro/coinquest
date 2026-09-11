/// <reference types="node" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    __PLAYWRIGHT__: JSON.stringify(process.env.PLAYWRIGHT === '1'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/phaser/') || id.includes('\\phaser\\')) return 'phaser'
          if (id.includes('/@supabase/') || id.includes('\\@supabase\\')) return 'supabase'
          if (id.includes('/dexie') || id.includes('\\dexie')) return 'dexie'
          if (id.includes('/react/') || id.includes('\\react\\') || id.includes('/react-dom/') || id.includes('\\react-dom\\')) {
            return 'react-vendor'
          }
          return undefined
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'CoinQuest — RPG Financeiro',
        short_name: 'CoinQuest',
        description: 'Controle financeiro local-first com uma interface em pixel art.',
        theme_color: '#101426',
        background_color: '#101426',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      },
      devOptions: {
        enabled: process.env.PLAYWRIGHT !== '1'
      }
    })
  ]
})
