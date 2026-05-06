import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html')
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'UrbanRetreat Homestay',
        short_name: 'UrbanRetreat',
        description: 'Homestay accounting and management',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/icons/icon-maskable-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/urban-homestay-default-rtdb\.firebaseio\.com\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
});
