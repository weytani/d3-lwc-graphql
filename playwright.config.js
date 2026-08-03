// ABOUTME: Playwright config for the local-only live-org chart sweep (never runs in CI).
// ABOUTME: Auth via sf frontdoor storageState from global-setup; baselines are committed.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./playwright",
  globalSetup: "./playwright/global-setup.js",
  timeout: 120000,
  workers: 1,
  retries: 0,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" }
  },
  use: {
    storageState: "playwright/.auth/agent.json",
    viewport: { width: 1600, height: 1000 },
    video: "off",
    trace: "retain-on-failure"
  }
});
