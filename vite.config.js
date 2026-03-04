import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const isGithubPagesBuild = process.env.VITE_DEPLOY_TARGET === 'github-pages';

  return {
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
        // Dev-only proxy for outbound callback webhook (hooks.newo.ai has no browser CORS headers).
        '/callback-webhook': {
          target: 'https://hooks.newo.ai',
          changeOrigin: true,
          secure: true,
          rewrite: () => '/UYFns5IzFhXs3Yi89vUTlg',
        },
      },
    },
    // Android/iOS webviews need relative asset paths; GitHub Pages needs repo base path.
    base: command === 'serve' ? '/' : isGithubPagesBuild ? '/iclub-demo-app/' : './',
  };
});
