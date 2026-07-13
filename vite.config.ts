import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-editor'
          if (id.includes('lowlight') || id.includes('highlight.js')) return 'vendor-highlight'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id.replaceAll('\\', '/'))) {
            return 'vendor-react'
          }
          return 'vendor'
        },
      },
    },
  },
})
