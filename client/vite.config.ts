import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { visualizer } from "rollup-plugin-visualizer"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Only runs with `ANALYZE=true npm run build` — writes dist/stats.html instead of adding
    // this to every normal build, since the plugin does real work (parsing/gzipping every
    // module) that a routine `npm run build` shouldn't pay for.
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
        /**
         * Splits the one 635 kB shared chunk into vendor groups.
         *
         * Everything the app shell touches used to land in a single `components-*.js` that the
         * entry HTML preloads — so one changed line in `src/components` invalidated 193 kB of
         * gzipped React Router, Radix, framer-motion and Zod for every returning user. These
         * libraries change on their own (slow) schedule; our code changes daily. Separate files
         * means a redeploy only busts the app chunk (now ~49 kB gzip).
         *
         * NAMING A CHUNK IS NOT FREE. A named chunk gets hoisted to wherever its members are
         * reachable from, which can promote a lazy library into an entry dependency. Two of these
         * bit during this change: a `vendor-charts` rule put 113 kB gzip of recharts in front of
         * first paint for people who never open a chart, and a `vendor-motion` rule pulled React
         * itself in alongside framer-motion, so every other chunk imported it just to get React.
         * Both are now unlisted and ship with whatever lazily imports them. Only add a rule here
         * for something the entry genuinely needs, and re-measure the entry after adding it.
         */
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          // React is named first and on its own. Left unnamed it gets swept into whichever
          // vendor chunk claims it, which is how it ended up inside `vendor-motion`.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('@radix-ui') || id.includes('@floating-ui') || id.includes('react-remove-scroll')) return 'vendor-radix';
          if (id.includes('/zod/')) return 'vendor-zod';
          if (id.includes('@tanstack')) return 'vendor-query';
          // Deliberately NOT chunked, per the warning above: recharts/d3 and framer-motion are
          // both reachable only through lazy routes now, and naming a chunk for either promoted
          // it to an entry dependency. Left unlisted, they ship with the routes that use them.
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
