# Security notes

* **API keys** are entered by the user and stored in this browser's `localStorage` (`tablemaker.ai.v1`). They are sent only to the chosen provider (OpenAI, Google, Anthropic) over HTTPS and never to any other host. localStorage is not encrypted: use keys with spending caps and avoid shared machines. "Remove all keys" wipes them.
* Anthropic browser calls use the `anthropic-dangerous-direct-browser-access` header (required for CORS). This is inherent to bring-your-own-key web apps.
* **CSP** (production build): scripts and styles from self only; `connect-src` limited to the three AI hosts.
* **Untrusted input**: imported JSON/XLSX/CSV/Markdown and pasted HTML are validated (`normalizeSchema`, `safeColor`, `isSafeImageSrc`) and sanitised with DOMPurify; generated HTML export escapes all text. Cell text is rendered by React (never `innerHTML`).
* **Images** are limited to `data:image/*` URLs; SVG is only ever shown through `<img>`/canvas so embedded scripts cannot run.
* **Dependencies**: CI runs `npm audit`, CodeQL and dependency review; Dependabot is enabled.
* AI output is treated as untrusted: it is parsed as JSON, colours are validated, and the whole change is one undoable step.

## Workflow hardening

Every workflow in `.github/workflows/` follows the same rules, and `zizmor --pedantic` audits them
on each pull request that touches them (`.github/workflows/zizmor.yml`) and can be run locally with
`pip install zizmor && zizmor --pedantic .github/workflows`.

* **Actions are pinned to a full 40 character commit SHA**, with the version tag in a trailing comment
  (`actions/checkout@11d5960a… # v4`). A moving tag can be repointed after review, a commit SHA cannot.
* **Least privilege**: `permissions: {}` at workflow level, and each job opts in to exactly what it
  needs. Most jobs get `contents: read`; the extra grants are narrow and documented inline
  (`security-events: write` for CodeQL, `pages: write` and `id-token: write` for the Pages deploy,
  `contents: write` for the desktop release).
* **`persist-credentials: false`** on every `actions/checkout`, so the token is not left in the local
  git config where a later step or a published artifact could pick it up.
* **No `${{ }}` inside `run:` blocks.** Values travel through `env:` and are read as shell variables,
  which keeps the shell away from template injection.
* **No `pull_request_target`** anywhere. It runs with the base repository's secrets and write token,
  so an untrusted pull request must never reach it.
* **`actions/cache` is not used for job output.** The only cache written from pull request code is
  the Playwright browser directory, keyed by OS, Playwright version and browser.
* Concurrency groups cancel superseded pull request runs, so a force push does not keep burning
  minutes.

## Secrets and tests

* No workflow needs a repository secret. The only token used is the automatic `GITHUB_TOKEN`, and it
  is granted the minimum scope each job needs.
* Artifacts are HTML reports and Playwright traces from a build of the repository. They contain no
  secrets, and they are uploaded only when a test fails.
* **The automated tests never use a real AI key.** The provider endpoints (OpenAI, Gemini,
  Anthropic) are intercepted with `page.route` and answered by the test itself, including the 401,
  429 and 500 responses used to prove the fallback order. The keys used are obvious dummies written
  into a browser context that is thrown away after the test. The suite therefore cannot spend money,
  cannot fail because of a quota, and never stores a real key in CI.
* Test-only dependencies (Playwright browsers, pydantic for the summary script) are downloaded from
  their official sources during CI and are pinned by version.