/**
 * @file vite.config.ts
 * @description Vite bundler and HMR dev-server configuration for Unseen.
 *
 * Feature Overview:
 * Compiles the responsive React + TypeScript Creator Studio & Android PWA interface
 * into `dist/` and proxies `/api/*` calls to the unified Node backend (`localhost:3001`)
 * during local `npm run dev` sessions.
 *
 * Primary Use Cases:
 * 1. Fast hot-module reload while building UI screens on macOS.
 * 2. Producing optimized static assets served by `createUnseenServer` on a single port.
 */

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { APP_CONFIG } from './src/config/appConfig';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: APP_CONFIG.server.uiDevPort,
    proxy: {
      '/api': {
        target: `http://localhost:${APP_CONFIG.server.defaultPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
