# Deployment

## GitHub Pages (free tier)
The build is fully static and uses relative asset paths (`base: './'`), so it works under `https://<user>.github.io/<repo>/`.

1. Push the repository to GitHub.
2. Settings → Pages → **Source: GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy-web.yml` runs the tests, builds and publishes `dist/`.

Manual build: `npm ci && npm run build:web` and serve `dist/` from any static host.

Notes: no server, no environment variables, no secrets. `public/.nojekyll` is included. The production build injects a strict CSP `<meta>` tag (`vite.config.ts`).

## Desktop (Windows / macOS / Linux)
Requires Rust and the Tauri prerequisites for your OS.
```
npm ci
npm run tauri dev      # development
npm run tauri build    # installers in src-tauri/target/release/bundle
```
Pushing a `v*` tag runs `.github/workflows/deploy-exe.yml`, which builds all three platforms and creates a draft GitHub release. Code signing/notarisation is not configured.
