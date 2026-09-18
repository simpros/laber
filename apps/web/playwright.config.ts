import { defineConfig, devices } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WEB_PORT = 3000;
const API_PORT = 3001;
const BASE_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const E2E_DATA_DIR = join(__dirname, "tests/.data");

if (!process.env.TEST_WORKER_INDEX) {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
  mkdirSync(E2E_DATA_DIR, { recursive: true });

  const distEntry = join(__dirname, "dist/index.html");
  if (!existsSync(distEntry)) {
    if (process.env.CI) {
      throw new Error(
        "apps/web/dist/index.html is missing: the CI build job must upload the web-dist artifact before e2e runs. Refusing to rebuild locally-built output on CI.",
      );
    }
    console.log("Building SPA for e2e tests...");
    execSync("bun run build", { stdio: "inherit", cwd: __dirname });
    console.log("Build complete\n");
  }
}

const apiEnv = {
  PORT: String(API_PORT),
  DATA_DIR: E2E_DATA_DIR,
  MIGRATIONS_FOLDER: join(__dirname, "../../packages/db/drizzle"),
  BETTER_AUTH_SECRET: "e2e-test-secret-key-for-testing-only",
  BETTER_AUTH_BASE_URL: BASE_URL,
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: {
      reducedMotion: "reduce",
    },
  },
  projects: [
    {
      name: "setup",
      testMatch: /config\/global\.setup\.ts/,
      teardown: "teardown",
    },
    {
      name: "auth setup",
      testMatch: /auth\.setup\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "teardown",
      testMatch: /config\/global\.teardown\.ts/,
    },
    {
      name: "chromium",
      testMatch: /\.e2e\.ts$/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["auth setup"],
    },
  ],
  webServer: [
    {
      // Elysia API with a temp SQLite file.
      command: "bun run src/index.ts",
      cwd: join(__dirname, "../server"),
      url: `${API_URL}/api/setup/status`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: apiEnv,
    },
    {
      // Built React SPA; /api/* proxies to the Elysia backend.
      command: "bun run preview",
      cwd: __dirname,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        LABER_API_URL: API_URL,
      },
    },
  ],
});
