// @ts-check
const { defineConfig } = require('@playwright/test');

const APP_PORT = 4318;
const FIXTURE_PORT = 4319;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node sample-app/src/server.js',
      url: `http://127.0.0.1:${APP_PORT}/`,
      env: { PORT: String(APP_PORT), MOCK_LATENCY_MS: '0' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `node e2e/fixtures-server.js ${FIXTURE_PORT}`,
      url: `http://127.0.0.1:${FIXTURE_PORT}/health`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
