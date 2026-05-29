import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const GUEST_AUTH = path.join(__dirname, 'tests/e2e/.auth/guest.json');
const ADMIN_AUTH = path.join(__dirname, 'tests/e2e/.auth/admin.json');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'guest',
      use: {
        ...devices['Desktop Chrome'],
        storageState: GUEST_AUTH,
      },
      testMatch: /(guest-booking|booking-conflict)\.spec\.ts/,
      dependencies: ['setup'],
    },
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_AUTH,
      },
      testMatch: /admin-rooms\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],
});
