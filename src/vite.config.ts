import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Stable, unhashed filenames. Syncthing propagates deletes and
        // creates independently, so content-hashed names guarantee a window
        // where the freshly-synced (tiny) index.html points at a JS bundle
        // that has not arrived yet AND whose predecessor was already
        // deleted -> the module 404s, Vue never mounts, and the launcher is
        // a blank, non-interactive screen. With fixed names the paths always
        // resolve; a half-finished sync just runs the previous bundle.
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
