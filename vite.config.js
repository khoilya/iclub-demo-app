import { defineConfig } from 'vite';

export default defineConfig({
  // Capacitor expects the built output in the "dist" directory (default).
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
