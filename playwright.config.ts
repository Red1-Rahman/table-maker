import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 4173);
/** GitHub Pages serves the app from a repository sub path, so the preview server mounts the build there too. */
const BASE_PATH = process.env.PW_BASE_PATH ?? '/table-maker/';
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;

const isCI = !!process.env.CI;

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
  // Every project is always declared. Which of them actually runs is decided by the `--project`
  // flags in the npm scripts, never by inspecting process.argv here: Playwright re-evaluates this
  // config inside each worker process, and a worker does not inherit the parent's CLI arguments, so
  // an argv-dependent project list makes workers fail with "project not found in the worker process".
  projects: [
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
    // Chromium is a local convenience only. CI selects firefox and webkit explicitly, so it never
    // runs there. See docs/testing.md.
    { name: 'chromium', use: { browserName: 'chromium' } },
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