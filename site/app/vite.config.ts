/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Court Week compiles into the internal `/jury/` asset directory and is
// presented canonically at `/` by the static `_redirects` proxy. Two build
// choices keep it inside the site's strict Content-Security-Policy
// (no `unsafe-inline` for scripts; only the reviewed Clarity tag is external):
//   - `modulePreload.polyfill: false` drops Vite's inline preload-polyfill
//     script (modern browsers preload natively), so no inline <script> ships;
//   - `assetsInlineLimit: 0` keeps every asset an external `self` URL rather
//     than an inlined `data:`/inline resource.
// `base` is only rewritten for the production build so `vite dev`/preview stay
// at `/`.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jury/' : '/',
  plugins: [react()],
  build: {
    outDir: '../public/jury',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Dynamic modules include the per-day unlock half. Keep their public
        // names opaque so ordinary asset inspection does not advertise court
        // days or the key-loading module before its runtime gates pass.
        chunkFileNames: 'assets/[hash].js',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
}))
