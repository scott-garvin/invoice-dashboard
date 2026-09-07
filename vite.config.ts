import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Deployed as a GitHub Pages project site at /invoice-dashboard/.
export default defineConfig({
  plugins: [vue()],
  base: '/invoice-dashboard/',
});
