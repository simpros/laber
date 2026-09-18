import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

const apiTarget = process.env.LABER_API_URL ?? "http://localhost:3001";

export default defineConfig({
  plugins: [tailwindcss(), react(), tsconfigPaths()],
  build: {
    // CI uploads `apps/web/build/` as the `web-build` artifact and the
    // Dockerfile copies it too — keep Vite output on that path instead of
    // the Vite default `dist/`.
    outDir: "build",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
