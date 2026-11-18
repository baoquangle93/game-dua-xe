import { defineConfig } from 'vite';

// base './' de game chay duoc o bat ky duong dan nao (ke ca GitHub Pages)
export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: { chunkSizeWarningLimit: 1000 }, // thư viện 3D Three.js khá nặng, đây là bình thường
});
