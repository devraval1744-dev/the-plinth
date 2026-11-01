import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Point the dev proxy at another backend with e.g. VITE_API_PROXY=http://localhost:5055
const apiTarget = process.env.VITE_API_PROXY || 'http://localhost:5001';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
