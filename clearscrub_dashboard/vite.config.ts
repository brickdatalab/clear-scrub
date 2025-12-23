import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'es2020',
    modulePreload: {
      polyfill: false,
    },
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk: Core React libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Vendor chunk: Supabase (heavy auth library)
          'vendor-supabase': ['@supabase/supabase-js'],

          // Vendor chunk: Radix UI primitives (grouped by usage)
          'vendor-radix-core': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-alert-dialog',
          ],
          'vendor-radix-forms': [
            '@radix-ui/react-select',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-switch',
            '@radix-ui/react-label',
          ],
          'vendor-radix-layout': [
            '@radix-ui/react-tabs',
            '@radix-ui/react-accordion',
            '@radix-ui/react-scroll-area',
          ],

          // Vendor chunk: TanStack (table + query heavy)
          'vendor-tanstack': ['@tanstack/react-table', '@tanstack/react-query'],

          // Vendor chunk: Form libraries
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],

          // Vendor chunk: Icons (lucide is large)
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600, // Warn if chunks exceed 600KB
  },
})
