import { defineConfig } from 'vite';

export default defineConfig({
  // Capacitor expects the built output in the "dist" directory (default).
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Dev-only same-origin proxy to avoid browser CORS preflight failures.
      '/newo-api': {
        target: 'https://app.newo.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/newo-api/, ''),
      },
    },
  },
  base: '/iclub-demo-app/',
});
