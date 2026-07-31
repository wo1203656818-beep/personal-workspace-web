import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:65404',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@react-pdf-viewer')) return 'pdf-viewer'
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          if (id.includes('docx-preview') || id.includes('xlsx')) return 'office'
          if (id.includes('recharts') || id.includes('react-activity-calendar')) return 'charts'
          if (id.includes('react-markdown') || id.includes('remark-gfm') || id.includes('rehype-highlight')) return 'markdown'
          if (id.includes('@hello-pangea/dnd')) return 'dnd'
          if (id.includes('cmdk')) return 'cmdk'
          if (id.includes('lucide-react')) return 'icons'
          return null
        },
      },
    },
  },
})
