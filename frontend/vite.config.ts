import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: '/static/app/',
  plugins: [react()],
  build: {target: 'es2020', sourcemap: false, cssCodeSplit: true},
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {'/api': {target: 'http://127.0.0.1:8000', changeOrigin: true}},
  },
});
