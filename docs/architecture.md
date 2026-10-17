# Architecture

Table Maker is a static single-page app (Vite + React + TypeScript). There is no backend; the same build runs on GitHub Pages and inside a Tauri desktop shell.

```
src/
  core/            Pure TypeScript (no React) - unit-tested in Node
    engine/        formulas, grid ops, layout, themes, validation, scene builder, canvas math
    export/        painters (canvas, PDF) + CSV/XLSX/MD/HTML/JSON exporters + importers
    ai/            provider adapters (fetch), prompt, response parser, auto-switch client
    input/         cross-platform key normalisation
  store/           Zustand slices (grid, canvas view, ai, ui) + Immer patch history + IndexedDB autosave
  hooks/           React glue (viewport virtualisation, shortcuts, AI service …)
  components/      canvas, grid, toolbar/inspector, export, ai, common
  types/           data contracts (docs/contracts.md)
```

## One scene, three outputs
`core/engine/scene.ts` turns a document into drawable primitives (cell boxes with resolved styles + coalesced border segments). The DOM grid, the Canvas 2D painter (PNG, raster PDF) and the jsPDF painter (vector PDF) all consume it, so on-screen and exported results match.

## State and history
All edits go through `commit(recipe)`: Immer `produceWithPatches` yields patches and inverse patches, stored on a 200-step stack. Undo/redo apply the patches. Memoised evaluators and layouts are keyed on Immer's structurally shared objects, so they invalidate automatically.

## Rendering performance
The canvas is zoomed with a CSS transform; `useViewport` converts the scroll rectangle into table coordinates and only the visible rows/columns (+ overscan) and frozen panes are rendered. Borders are drawn in one SVG layer.

## Canvas modes
`computeCanvasLayout` decides page size and content scale from the aspect ratio, margin and `LockMode`. Guides (margins, bleed, page breaks, crop marks) are UI only and never exported.

## Export pipeline
`exportBatch` runs all selected exporters concurrently; heavy ones (`jspdf`, XLSX, canvas) are dynamic imports so the first load stays small. Vector PDF uses jsPDF's built-in fonts (Latin-1). If any cell contains other scripts (e.g. Bengali, Arabic, CJK) the PDF automatically falls back to high-resolution raster pages so nothing renders as garbage.

## Desktop
`src-tauri` is a thin Tauri v2 shell. In the desktop app `utils/platform.ts` uses the native save dialog and `plugin-fs`; in the browser it triggers a normal download.

## Test layering
`core/` is pure TypeScript, so it is unit tested directly in Node (`tests/unit/`). `App` and the store
contract are covered by a jsdom component test (`tests/component/`). Everything that only a browser can
answer (IndexedDB drafts, canvas painting, downloads, import files, clipboard events, provider
requests, WebSockets, MIME types) lives in `tests/e2e/` and runs against the built app in Firefox and
WebKit. Those specs import `test` from `tests/fixtures/diagnostics.ts` instead of `@playwright/test`:
the fixture attaches network, response status, console, page error and WebSocket listeners before the
first navigation and asserts them in teardown, so the browser level checks are automatic rather than
optional. It also attaches the collected data to the test result for debugging. See `docs/testing.md`
for the diagnostics categories, the console allowlist rules and the honest limits of WebKit.
