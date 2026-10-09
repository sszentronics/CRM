import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Creates the local test accounts and saves a signed-in session for each role.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /performance.spec.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
    },
    // Timing tests run alone, after everything else, so they never compete with other tests for the processor.
    {
      name: "performance",
      testMatch: /performance.spec.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["chromium"],
      fullyParallel: false,
    },
  ],
  webServer: {
    // Tests run against a production build so they see what users see. Needs `pnpm db:start`.
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
