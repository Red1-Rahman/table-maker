# Deployment

## GitHub Pages (free tier)
The build is fully static and uses relative asset paths (`base: './'`), so it works under `https://<user>.github.io/<repo>/`.

1. Push the repository to GitHub.
2. Settings → Pages → **Source: GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy-web.yml` runs the tests, builds and publishes `dist/`.

Manual build: `npm ci && npm run build:web` and serve `dist/` from any static host.

Notes: no server, no environment variables, no secrets. `public/.nojekyll` is included. The production build injects a strict CSP `<meta>` tag (`vite.config.ts`).

## Continuous integration

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | push to `main`, any pull request | lint, typecheck, contract check, Vitest with coverage, production build |
| `cross-platform.yml` | push to `main`, any pull request | Vitest on Linux, Windows and macOS (no browser run) |
| `cross-browser.yml` | pull request, push to `main`, manual | the Playwright suite in Firefox and WebKit |
| `security.yml` | push to `main`, pull request, Mondays 05:00 UTC | `npm audit`, CodeQL |
| `supply-chain.yml` | pull request | dependency review of `package-lock.json` |
| `zizmor.yml` | pull request or push when `.github/workflows/**` changes, manual | `zizmor` workflow security audit |
| `deploy-web.yml` | push to `main`, manual | test, build, publish GitHub Pages |
| `deploy-exe.yml` | `v*` tag, manual | Tauri bundles and a draft GitHub release |

`cross-browser.yml` is the one that proves the web app works in Firefox and in Safari's engine. It
mounts the production build under `/table-maker/` with `vite preview`, exactly like the GitHub Pages
sub path, and runs one matrix job per browser.

**Path filters.** `cross-browser.yml` only starts for changes to `src/`, `tests/`, `public/`,
`index.html`, `package.json`, `package-lock.json`, the vite, Playwright, Tailwind, PostCSS,
tsconfig and Biome configuration files, or the workflow itself. A documentation-only pull request
does not spend runner minutes.

**Runners and budget.** Only `ubuntu-latest` is used. There is no macOS or Windows runner in the
cross-browser workflow: Playwright WebKit runs on Linux, which keeps the cost at the standard rate
instead of the 10x macOS rate. The job budget is:

* one job, `timeout-minutes: 15`, two matrix entries (`firefox`, `webkit`) with `fail-fast: false`
  so one engine failing still reports the other;
* `retries: 1` and `workers: 1`, which is sized for a 2-core runner;
* each matrix job installs exactly one browser and runs exactly that one project, and it is built
  once per job by the Playwright `webServer`, so there is no second build step;
* traces (`on-first-retry`) and the HTML report are uploaded **only** on failure, with
  `retention-days: 7` and `if-no-files-found: ignore`;
* no nightly runs and no matrix sharding. The suite currently finishes in well under the 15 minute
  cap, so sharding would only add overhead. If it ever grows past about 8 minutes, add a `shard`
  matrix and split the HTML report before increasing the budget.

Each job writes a summary with the measured wall clock time, so the minutes actually spent stay
visible in the run.

**Caching.** `npm ci` uses the built-in `setup-node` npm cache. Browser binaries are cached in
`~/.cache/ms-playwright`, keyed by OS, the exact Playwright version read from `package.json`
(`1.64.0`, pinned without a caret range so the key is stable) and the browser name. `npm ci` runs
before any `npx playwright` call, so `npx` resolves the pinned runner rather than whatever version
the registry offers. `playwright install-deps` always runs, because the system libraries must match
the runner image even on a cache hit, and `playwright install <browser>` also always runs: it is
already idempotent and downloads nothing when the browser is present, which makes it cheaper and more
reliable than trying to detect a warm cache by hand. Nothing else is cached, and no cache entry is
ever created from untrusted pull request code other than that browser directory.

## Desktop (Windows / macOS / Linux)
Requires Rust and the Tauri prerequisites for your OS.
```
npm ci
npm run tauri dev      # development
npm run tauri build    # installers in src-tauri/target/release/bundle
```
Pushing a `v*` tag runs `.github/workflows/deploy-exe.yml`, which builds all three platforms and creates a draft GitHub release. Code signing/notarisation is not configured.

`deploy-exe.yml` runs on a 60 minute timeout and builds three platforms, so it is the most expensive
job in the repository. It does not depend on any pull request run and is not verified by them. Two
details are worth knowing before you tag:

* The release job needs `contents: write` and nothing else. `write` implies `read`, so the checkout
  works without a separate `contents: read` entry.
* It uses the Rust toolchain that the runner image ships rather than pinning one. The macOS matrix
  entry adds `aarch64-apple-darwin` and `x86_64-apple-darwin` with `rustup target add` for the
  universal bundle. If a future release needs a specific Rust version, add
  `dtolnay/rust-toolchain` back, pinned to a commit SHA.