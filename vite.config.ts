import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Deployed as a GitHub Pages project site at /invoice-dashboard/.
export default defineConfig({
  plugins: [vue()],
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8081" },
  },
});
