import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import cesium from "vite-plugin-cesium";
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), cesium(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
