import { defineConfig } from "@playwright/test";

const basePath = process.env.BOLT95_BASE ?? "/";
const subpath = basePath !== "/";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: new URL(basePath, "http://127.0.0.1:8000").href,
    trace: "retain-on-failure",
  },
  webServer: {
    command: subpath
      ? "npm run build:subpath && npm run preview:subpath"
      : "npm run dev",
    url: new URL(basePath, "http://127.0.0.1:8000").href,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
