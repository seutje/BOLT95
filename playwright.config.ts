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
      ? "VITE_BOLT95_E2E=1 npm run build:subpath && npm run preview:subpath"
      : "VITE_BOLT95_E2E=1 npm run build && npm run preview",
    url: new URL(basePath, "http://127.0.0.1:8000").href,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
