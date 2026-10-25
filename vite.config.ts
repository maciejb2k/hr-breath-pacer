import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// https + host: the dev server is reachable from a phone on the same Wi-Fi.
// Web Bluetooth only works in a secure context (https or localhost).
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    // Installable app + offline copy. 'prompt': a new version downloads in the background and
    // waits; the app offers a reload only outside a session (a reload mid-session would cut
    // the music and drop the smartwatch). Closing the app also lets it take over on next launch.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'HR Breath Pacer',
        short_name: 'Breath Pacer',
        description: 'Calming music driven by your heart rate, paced to your breath.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0a1122',
        theme_color: '#0a1122',
        categories: ['health', 'lifestyle', 'music'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // the preview image is only for link scrapers; Vietnamese glyphs load on demand if ever needed
        globIgnores: ['**/og-image.png', '**/*vietnamese*'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: true },
  preview: { host: true },
  // Tone.js alone is ~350 kB; one bundle is fine for an app that is opened and left running
  build: { chunkSizeWarningLimit: 900 },
});
