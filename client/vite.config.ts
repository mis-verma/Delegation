import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { visualizer } from "rollup-plugin-visualizer"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    process.env.ANALYZE === 'true' &&
      visualizer({ filename: process.env.ANALYZE_TEMPLATE === 'raw-data' ? 'dist/stats.json' : 'dist/stats.html', gzipSize: true, brotliSize: true, template: (process.env.ANALYZE_TEMPLATE as 'treemap' | 'raw-data' | undefined) ?? 'treemap' }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('@radix-ui') || id.includes('@floating-ui') || id.includes('react-remove-scroll')) return 'vendor-radix';
          if (id.includes('/zod/')) return 'vendor-zod';
          if (id.includes('@tanstack')) return 'vendor-query';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
