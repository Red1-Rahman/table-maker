# Testing

Table Maker is covered by three layers. Each layer answers a different question, and the layers are
deliberately cheap to run in that order.

| Layer | Tool | Location | What it proves | Typical runtime |
| --- | --- | --- | --- | --- |
| Unit | Vitest | `tests/unit/` | Pure engine code (formulas, grid matrix, canvas ratio, exporters, key normalisation) | seconds |
| Component | Vitest + Testing Library (jsdom) | `tests/component/` | The App shell renders and the store talks to it | seconds |
| End to end | Playwright (Firefox, WebKit) | `tests/e2e/` | The production build behaves in the browser: network, statuses, console, page errors, WebSockets | a few minutes |

## Running the tests

```bash
npm test                      # unit + component (Vitest)
npm run test:coverage         # same, with v8 coverage for src/core
npm run test:e2e              # Firefox + WebKit against vite preview of dist/
npm run test:e2e:ci           # same two projects, the exact command CI runs
npm run test:e2e:chromium     # optional local Chromium project (see below)
npx playwright show-trace test-results/<test>/trace.zip   # open a trace
```

The Playwright config builds the app and serves it with `vite preview` under `/table-maker/`, so the
tests exercise the same relative asset paths GitHub Pages uses. Chromium is not part of CI. Run it
locally with `npm run test:e2e:chromium`, and `npm run test:e2e:all` for the three engines at once,
because running a third engine costs minutes that the budget in `docs/deployment.md` does not have.
The project list in `playwright.config.ts` is static on purpose: Playwright re-reads the config inside
each worker process, so a project list that depends on `process.argv` breaks the workers. Which
projects run is decided only by the `--project` flags in the npm scripts.

## The diagnostics fixture

`tests/fixtures/diagnostics.ts` exports its own `test`, so importing it is all it takes to get the
browser checks. Every spec starts from that import:

```ts
import { expect, test } from '../fixtures/diagnostics';

test('example', async ({ page, diagnostics }) => {
  await page.goto('./');
  // the usual assertions
});
```

The fixture attaches its listeners before the first navigation and asserts in teardown, so a spec
cannot forget them. It collects the same categories of signal that you would inspect by hand in the
DevTools network and console panels:

1. **network**: every request is recorded. A failed same-origin request fails the test. A request to an
   origin outside the allowlist fails the test. The allowlist is `ORIGIN_ALLOWLIST` (the three AI
   hosts, matching the production `connect-src`) plus `diagnostics.allowOrigin()` for fixtures a test
   starts itself.
2. **status**: every same-origin response must be 2xx or 3xx (304 is accepted). Any 4xx or 5xx fails
   with the URL, the status, the resource type and the `content-type`.
3. **console**: `error` and `warning` messages fail the test unless they match a documented
   allowlist entry.
4. **pageerror**: any uncaught exception fails the test, and any unhandled promise rejection captured
   by the injected listener fails it too.
5. **websocket**: the fixture subscribes to `websocket`, `framesent`, `framereceived`, `socketerror`
   and `close`. The production build must open no sockets, so any unexpected socket is a failure.

The full snapshot (requests, statuses, console messages, sockets, problems) is attached to every test
result as `diagnostics.json`. When a test fails you get both the assertion message and that file.

### Console allowlist rules

The production build is supposed to be silent, so `CONSOLE_ALLOWLIST` in the fixture starts almost
empty. Each entry needs three things:

```ts
{
  pattern: /classified as a bounce tracker/,
  reason: 'Why this message is acceptable, in full sentences.',
  browsers: ['firefox'], // which Playwright project it applies to, or '*' for all
}
```

Rules that keep this honest:

* A pattern must be specific. Never match a whole message prefix that the app could also emit.
* The reason has to explain why the message cannot be fixed in the app, not why the test is inconvenient.
* The browser scope has to be the narrowest list that works. A Firefox only quirk must not silence
  WebKit.
* A test that provokes a message itself (for example a mocked 401 in `tests/e2e/ai.spec.ts`) uses
  `diagnostics.allowConsole(pattern, reason)` instead, so the reason travels with the test.

### The WebSocket self-test

The "no sockets" rule is only meaningful if the collector really sees sockets.
`tests/e2e/websocket-selftest.spec.ts` starts a small local WebSocket echo server
(`tests/fixtures/wsEchoServer.ts`, no dependencies) and asserts that the collector recorded the
socket, the frames it sent and received, and the close event. The echo page is served by that fixture
itself, because the production CSP has a narrow `connect-src` and would block the socket first.

### Adding a spec

1. Put the file in `tests/e2e/` with a `.spec.ts` suffix, and import `test` and `expect` from
   `../fixtures/diagnostics`.
2. Navigate with `page.goto('./')`, which resolves against the base URL of the preview server.
3. Use the helpers in `tests/e2e/helpers.ts` (`gotoApp`, `cell`, `rowHeader`, `setCell`,
   `samplePixels`, `waitForDraftSaved`, `readIndexedDbDraft`).
4. Prefer web-first assertions (`expect(locator).toHaveText`) and `expect.poll` over fixed sleeps.
   A `waitForTimeout` in this suite is a bug unless it waits for something the app cannot report.
5. If the feature does not exist yet in a browser, use `test.fixme(true, 'reason')` with a written
   reason. Never a silent `test.skip()`.

## What the end to end suite covers

* **Loading**: the app boots from the GitHub Pages base path, assets return the right MIME types and
  the page is not blank (pixel sampling of a screenshot, not a golden image comparison).
* **Editing**: cell edits, undo and redo, `SUM`, `IF` and `ROUND`, insert and delete rows and columns,
  merge and unmerge, and column reordering by dragging a header.
* **Persistence**: the draft reaches IndexedDB (not the localStorage fallback) and is restored after a
  reload, and a fresh browser context never sees another test's draft.
* **Import and export**: CSV, JSON, Markdown and XLSX import; CSV, JSON, Markdown, HTML, PDF, PNG and
  the combined `.zip` export, checking the suggested filename, the content and the file signatures.
* **Viewport**: Ctrl/Cmd + wheel zoom, the 10 % to 500 % limits, space + drag panning and fit to
  screen.
* **AI editing**: OpenAI, Gemini and Anthropic are intercepted with `page.route`. The tests assert that
  a key only ever reaches its own provider origin, that a 401, 429 or 500 falls through to the next
  provider, and that the applied change is exactly one undo step. No real API key is ever used or
  needed, in CI or locally.
* **Clipboard**: copy, cut and paste through synthetic clipboard events in every engine, plus the real
  OS clipboard where the engine allows Playwright to grant clipboard permissions.
* **WebSockets**: no socket in the production build, plus the collector self-test.

## Debugging a CI failure

1. Open the job summary. It shows a table with passed, failed, flaky and skipped counts per browser,
   the measured run time, and for every failure the diagnostic category that failed (`network`,
   `status`, `console`, `pageerror` or `websocket`). Durations are converted from the milliseconds
   Playwright reports into seconds, so a browser that really took four minutes shows about `240.0s`.
   A number in the thousands of seconds means the conversion broke, not that the suite was slow.
2. Download the `playwright-<browser>` artifact from the failed run. It contains the HTML report and
   `test-results/**/trace.zip` (kept for 7 days, uploaded only on failure).
3. Run `npx playwright show-trace path/to/trace.zip`. The trace viewer records every action, the DOM
   snapshots after each action, console output, the network log and the timing. It is the fastest way
   to see what the browser actually did between two assertions.
4. `diagnostics.json`, attached to every test result, tells you which category failed and why. The
   failure message in the log repeats the same information, grouped by category.

## Workflows

| Workflow | Trigger | Runner | Job |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | push to `main`, pull request | ubuntu-latest | lint, typecheck, contract check, Vitest with coverage, build |
| `.github/workflows/cross-platform.yml` | push to `main`, pull request | ubuntu, windows, macos | Vitest on three operating systems. No browser run: that is `cross-browser.yml`. |
| `.github/workflows/cross-browser.yml` | pull request, push to `main`, manual, path filtered | ubuntu-latest, matrix `firefox` and `webkit` | the full Playwright suite in both engines with the diagnostics fixture |
| `.github/workflows/security.yml` | push to `main`, pull request, weekly schedule | ubuntu-latest | `npm audit`, CodeQL for JavaScript and TypeScript |
| `.github/workflows/supply-chain.yml` | pull request | ubuntu-latest | dependency review of the lock file |
| `.github/workflows/zizmor.yml` | pull request and push when workflows change, manual | ubuntu-latest | `zizmor` audit of every workflow |
| `.github/workflows/deploy-web.yml` | push to `main`, manual | ubuntu-latest | test, build and publish GitHub Pages |
| `.github/workflows/deploy-exe.yml` | `v*` tags, manual | windows, macos, ubuntu | Tauri bundles and a draft GitHub release |

Details about triggers, permissions, caching and the runner minute budget are in
`docs/deployment.md` and `docs/security.md`.

## Honest limitations

* **Playwright WebKit is not Safari.** It uses the same engine family, but it is not Safari on macOS:
  no macOS specific quirks, different codecs, different platform APIs and a different user agent. It
  is a strong signal, not proof. Anything that depends on a macOS Safari behaviour still needs a
  manual check on a real Mac.
* **Clipboard permissions** cannot be granted in Firefox or WebKit in headless mode, so the OS
  clipboard path is marked `test.fixme` there. The app's own clipboard logic is still covered by the
  synthetic event tests.
* **HTML5 drag and drop** cannot be driven in WebKit by Playwright, so column reordering by header
  drag runs in Firefox only. `moveLine` itself is covered by unit tests.
* **No real macOS or Windows browser run.** Everything cross platform is Playwright on Linux.