import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE_PATH mirrors the server's BASE_PATH (e.g. "/censorship" when
// deployed at https://enclaverp.cc/censorship behind Cloudflare). Leave
// unset to build for the domain root.
const basePath = process.env.VITE_BASE_PATH ?? "";

export default defineConfig({
  base: basePath ? `${basePath}/` : "/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
