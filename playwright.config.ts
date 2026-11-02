import { defineConfig } from '@playwright/test';

const PORT = 8799;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  reporter: 'list',
  forbidOnly: !!process.env.CI,
  // 録音は実時間で進むので、1本の時間は音の長さより短くならない。
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `npm run build && npx wrangler dev --ip 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
