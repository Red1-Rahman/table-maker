import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 4173);
/** GitHub Pages serves the app from a repository sub path, so the preview server mounts the build there too. */
const BASE_PATH = process.env.PW_BASE_PATH ?? '/table-maker/';
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;

const isCI = !!process.env.CI;
/** Chromium stays a local convenience: enable it with PW_CHROMIUM=1 or by naming the project explicitly. */
const withChromium = process.env.PW_CHROMIUM === '1' || process.argv.includes('--project=chromium');

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  // Every spec runs on a fresh context, so IndexedDB and localStorage never leak between tests.
  fullyParallel: false,
  workers: isCI ? 1 : undefined,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? 'playwright-report/results.json' }],
      ]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
    // Chromium is a local convenience only. CI never runs it, see docs/testing.md.
    ...(withChromium ? [{ name: 'chromium', use: { browserName: 'chromium' as const } }] : []),
  ],
  webServer: {
    command: `npm run build:web && npm run preview -- --base ${BASE_PATH} --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});