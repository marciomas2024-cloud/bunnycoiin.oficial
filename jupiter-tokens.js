import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // Proxy local para dev: redireciona /api/jupiter-* para a Jupiter diretamente,
    // injetando a API key do .env.local. Em produção, as funções serverless do
    // Vercel (/api/*.js) cuidam disso com a variável de ambiente JUPITER_API_KEY.
    proxy: {
      '/api/jupiter-quote': {
        target: 'https://api.jup.ag',
        changeOrigin: true,
        rewrite: (path) => '/swap/v1/quote',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (process.env.JUPITER_API_KEY) {
              proxyReq.setHeader('x-api-key', process.env.JUPITER_API_KEY);
            }
          });
        },
      },
      '/api/jupiter-swap': {
        target: 'https://api.jup.ag',
        changeOrigin: true,
        rewrite: () => '/swap/v1/swap',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (process.env.JUPITER_API_KEY) {
              proxyReq.setHeader('x-api-key', process.env.JUPITER_API_KEY);
            }
          });
        },
      },
      '/api/jupiter-tokens': {
        target: 'https://api.jup.ag',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          return `/tokens/v2/search?query=${url.searchParams.get('query') || ''}`;
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (process.env.JUPITER_API_KEY) {
              proxyReq.setHeader('x-api-key', process.env.JUPITER_API_KEY);
            }
          });
        },
      },
    },
  },
});
