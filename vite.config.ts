import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https + host: the dev server is reachable from a phone on the same Wi-Fi.
// Web Bluetooth only works in a secure context (https or localhost).
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { host: true },
  preview: { host: true },
  // Tone.js alone is ~350 kB; one bundle is fine for an app that is opened and left running
  build: { chunkSizeWarningLimit: 900 },
});
