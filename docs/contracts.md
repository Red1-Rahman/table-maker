# Data contracts

Source of truth: `src/types/schema.ts`. `npm run check:contracts` fails CI if a type exported there is not mentioned here.

## Document: `TableSchema`

| Field | Type | Notes |
|---|---|---|
| `id`, `title`, `version` | string | `version` is `SCHEMA_VERSION` (`1.0.0`) |
| `aspectRatio` | `AspectRatioId` | `1:sqrt2`, `sqrt2:1`, `16:9`, `4:3`, `1:1`, `custom` |
| `dimensions` | `{columns, rows, customWidthPx?, customHeightPx?}` | kept in sync with `columns` / `rows` arrays |
| `styles` | `TableGlobalStyles` | theme id, zebra, header rows, padding, base font, grid line |
| `canvas` | `CanvasSettings` | `lockMode` (`LockMode`), page `bg`, `margin`, `bleed` |
| `columns` / `rows` | `ColumnMeta[]` / `RowMeta[]` | width / height in px |
| `cells` | `Record<"row:col", CellData>` | sparse; empty cells are absent |
| `mergedRanges` | `CellRange[]` | zero-based inclusive; origin = top-left |
| `borders` | `Record<edgeKey, BorderSpec>` | see below |
| `conditionalRules` | `ConditionalRule[]` | |
| `validations` | `ValidationRule[]` | |
| `filters` | `FilterRule[]` | AND-combined, hide rows below the header |
| `frozen` | `{rows, cols}` | |

### Pixel sizes and ratios
All sizes are CSS px at 96 DPI. A-series pages are `794 × 794·√2` (portrait) so the ratio is exactly `1 : √2`.

### `LockMode`
* `growth` - inserting rows/columns or resizing that would exceed the page is rejected (new lines are shrunk to the room left).
* `autoscale` - the table is scaled down uniformly to fit inside the margins (never enlarged).
* `free` - page width grows to the table; page height grows in whole pages. PDF paginates; page-break guides are shown.

## Cells
* `CellData { value, type: CellType, style?: CellStyle, imageConfig?: ImageConfig, comment? }`
* `value` is the raw text. A value starting with `=` is a formula.
* `CellType`: `text | number | image | boolean | date`. `boolean` renders a checkbox (`TRUE` / `FALSE`).
* `CellStyle` is **cell level** (not per character): bold, italic, underline, strike, colour, fill, font family id, font size, `HAlign`, `VAlign`, wrap, list (`bullet`/`number`), padding.
* `ImageConfig { src, fitMode: ImageFitMode, altText?, naturalWidth?, naturalHeight? }`. `src` must be a `data:image/…` URL (enforced on import). `ImageFitMode`: `contain | cover | stretch | original | center`.

## Borders (edge model)
Borders belong to *edges*, not cells, so neighbouring cells never draw double lines.
* `h:r:c` - horizontal edge above row `r` under column `c` (`r` ranges `0…rows`).
* `v:r:c` - vertical edge left of column `c` beside row `r` (`c` ranges `0…columns`).
* `BorderSpec { width, style: LineStyle, color }`. `width: 0` hides an edge; no entry means "use the theme grid" (`TableGlobalStyles.gridStyle/gridWidth/gridColor`).
* Edges strictly inside a merged range are never drawn.

## Rules
* `ValidationRule { id, range: CellRange, type: ValidationType, options?, min?, max? }` - `ValidationType`: `text | number | select | date | email | url | checkbox`.
* `ConditionalRule { id, range, op: CondOp, value?, value2?, style?, scale?, barColor? }` - `CondOp`: `gt | lt | eq | contains | between | dateBetween | colorScale | dataBar`.
* `FilterRule { id, col, op, value?, value2? }`.

## Formulas
`SUM AVERAGE AVG MIN MAX COUNT COUNTA CONCAT IF ROUND ABS`, operators `+ - * / ^ & %` and comparisons, A1 references and ranges. Errors: `#REF! #DIV/0! #NAME? #VALUE! #CYCLE! #ERROR!`. References are rewritten when rows/columns are inserted or deleted. They are **not** rewritten when rows are sorted or moved.

## JSON export envelope
```json
{ "format": "table-maker", "version": "1.0.0", "title": "…", "data": [["…"]], "document": { /* TableSchema */ } }
```
Import accepts the envelope, a raw `TableSchema`, an array of arrays, or an array of objects. Every import passes through `normalizeSchema()`, which clamps sizes, validates colours and drops non-`data:` image sources.

## AI response contract
Models must return `{ "message": string, "table"?: { "rows": AICell[][], "merges"?: string[], "columnWidths"?: number[] } }` (see `src/types/ai.ts`). A cell is a scalar or `{v, bold, italic, underline, color, bg, align}`; `{image: true}` keeps the existing image in place. Results are applied as one undoable commit.
