/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// The Daily Docket ships as static assets served by the site Worker at
// `/today/` (see site/package.json `build:app` and wrangler.json). Two build
// choices keep it inside the site's strict Content-Security-Policy
// (`script-src 'self'`, no `unsafe-inline` for scripts):
//   - `modulePreload.polyfill: false` drops Vite's inline preload-polyfill
//     script (modern browsers preload natively), so no inline <script> ships;
//   - `assetsInlineLimit: 0` keeps every asset an external `self` URL rather
//     than an inlined `data:`/inline resource.
// `base` is only rewritten for the production build so `vite dev`/preview stay
// at `/`.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/today/' : '/',
  plugins: [react()],
  build: {
    outDir: '../public/today',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}))
