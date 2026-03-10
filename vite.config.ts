import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/AI-Colony/',
  plugins: [react()],
  server: { port: 3000 },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        // Prevent workers from sharing chunks with the main bundle,
        // which would pull in React/DOM code that crashes in a Worker context.
        inlineDynamicImports: true,
      },
    },
  },
})
