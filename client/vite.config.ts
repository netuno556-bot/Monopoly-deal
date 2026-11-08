import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy em dev: o browser fala com o Vite, que repassa para o servidor Socket.io
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Escuta em todas as interfaces: celular na mesma rede acessa
    // http://<IP-do-PC>:5173 e o proxy repassa o Socket.io ao servidor :3001
    host: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
