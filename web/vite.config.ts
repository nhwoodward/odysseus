import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Inject the FastAPI CSP nonce placeholder onto every emitted <script>.
// `_serve_html_with_nonce` substitutes {{CSP_NONCE}} per request.
const cspNonce = {
  name: 'csp-nonce',
  transformIndexHtml(html: string) {
    return html.replace(/<script(?![^>]*\bnonce=)/g, '<script nonce="{{CSP_NONCE}}"')
  },
}

export default defineConfig({
  base: '/static-v2/',
  plugins: [react(), tailwindcss(), cspNonce],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Content-hash the entry too (not a stable `index.js`) so a deploy can't
        // serve stale cached JS — index.html references the new hash each build.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Split heavy vendor libs into separate, independently-cacheable chunks
        // (the markdown/math/highlight stack is large and changes rarely).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // katex + highlight.js get their OWN chunks (each was lumped into the
          // big "markdown" chunk that itself exceeded 500kB).
          if (id.includes('katex')) return 'katex'
          if (/highlight\.js|lowlight/.test(id)) return 'highlight'
          if (/react-markdown|rehype|remark|hast|mdast|micromark|unist|property-information|space-separated|comma-separated|character-entities|decode-named|html-url|trim-lines|web-namespaces|zwitch|bail|trough|vfile|devlop|estree|ccount|markdown-table|longest-streak|escape-string-regexp|mathml-tag-names/.test(id)) return 'markdown'
          // recharts (+ its bundled d3 / victory-vendor) only loads on the lazy
          // Finance route — keep it out of the shared chunks.
          if (id.includes('recharts') || /node_modules\/(d3-|victory-vendor|internmap)/.test(id)) return 'charts'
          if (id.includes('react-router')) return 'router'
          // react-table must NOT ride the eager `query` chunk (react-query is
          // imported synchronously by App) — give it its own async chunk.
          if (id.includes('@tanstack/react-table')) return 'table'
          if (id.includes('@tanstack')) return 'query'
          if (id.includes('framer-motion') || /node_modules\/motion/.test(id)) return 'motion'
          if (id.includes('react-dom') || /node_modules\/react\//.test(id) || id.includes('scheduler')) return 'react'
        },
      },
    },
  },
})
