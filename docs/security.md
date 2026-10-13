# Security notes

* **API keys** are entered by the user and stored in this browser's `localStorage` (`tablemaker.ai.v1`). They are sent only to the chosen provider (OpenAI, Google, Anthropic) over HTTPS and never to any other host. localStorage is not encrypted: use keys with spending caps and avoid shared machines. "Remove all keys" wipes them.
* Anthropic browser calls use the `anthropic-dangerous-direct-browser-access` header (required for CORS). This is inherent to bring-your-own-key web apps.
* **CSP** (production build): scripts and styles from self only; `connect-src` limited to the three AI hosts.
* **Untrusted input**: imported JSON/XLSX/CSV/Markdown and pasted HTML are validated (`normalizeSchema`, `safeColor`, `isSafeImageSrc`) and sanitised with DOMPurify; generated HTML export escapes all text. Cell text is rendered by React (never `innerHTML`).
* **Images** are limited to `data:image/*` URLs; SVG is only ever shown through `<img>`/canvas so embedded scripts cannot run.
* **Dependencies**: CI runs `npm audit`, CodeQL and dependency review; Dependabot is enabled.
* AI output is treated as untrusted: it is parsed as JSON, colours are validated, and the whole change is one undoable step.
