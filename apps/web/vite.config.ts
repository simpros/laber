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
    // Pin IPv4 loopback: the default `localhost` bind resolves to a single
    // address family (observed ::1-only in CI), while HTTP clients pick
    // their own family to try first — a refused first family with no
    // fallback means the e2e readiness probe never connects even though the
    // server is up. 127.0.0.1 is deterministic on every machine.
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
