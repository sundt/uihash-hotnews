import { defineConfig, devices } from '@playwright/test';

process.env.VIEWER_PATH = process.env.VIEWER_PATH || '/?e2e=1';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8090';
const isLocalBaseUrl = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseURL);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI || !isLocalBaseUrl ? undefined : {
    command: 'echo "Please ensure Docker container is running on port 8090"',
    url: 'http://127.0.0.1:8090/health',
    reuseExistingServer: true,
    timeout: 5000,
  },
});
