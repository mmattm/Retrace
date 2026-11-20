import { defineConfig } from 'vite';
import { localProjectDeletion } from './timeline/project-delete.js';

export default defineConfig({
  server: {
    proxy: {
      '^/api/(tags|chat)$': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        bypass(request) {
          const method = request.url === '/api/chat' ? 'POST' : 'GET';
          const { origin, host } = request.headers;
          if (request.method !== method) return false;
          if (origin && origin !== `http://${host}` && origin !== `https://${host}`) return false;
        },
        configure(proxy) {
          // The browser talks to Vite on the same origin. Ollama stays on loopback.
          proxy.on('proxyReq', request => request.removeHeader('origin'));
        },
      },
    },
  },
  plugins: [localProjectDeletion(), {
    name: 'retrace-network-addresses',
    apply: 'serve',
    transformIndexHtml(_html, { server }) {
      // Use the same addresses and actual port that the dev server prints.
      return (server?.resolvedUrls?.network ?? []).map(url => ({
        tag: 'meta',
        attrs: { name: 'retrace-network-url', content: url },
        injectTo: 'head',
      }));
    },
  }],
});
