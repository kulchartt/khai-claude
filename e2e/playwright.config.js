const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90000,
  retries: 1,                  // retry once on flaky network
  workers: 1,                  // sequential — tests share a live DB
  fullyParallel: false,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'https://kulchartt.github.io/khai-claude/',
    headless: false,
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
  ],
});
