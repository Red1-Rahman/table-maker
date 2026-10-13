import { type CellData, type CellRange, type TableSchema, cellKey, parseKey } from '@/types/schema';
import { isSafeImageSrc, safeColor } from '@/utils/sanitization';
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, MIN_COL_WIDTH, MIN_ROW_HEIGHT, createDefaultTable } from './defaults';
import { MAX_COLS, MAX_ROWS, inferType } from './gridMatrix';
import { THEMES } from './themes';

const num = (v: unknown, d: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;

const asRange = (r: any, rows: number, cols: number): CellRange | null => {
  if (!r || typeof r !== 'object') return null;
  const r1 = Math.floor(num(r.r1, -1));
  const c1 = Math.floor(num(r.c1, -1));
  const r2 = Math.floor(num(r.r2, -1));
  const c2 = Math.floor(num(r.c2, -1));
  if (r1 < 0 || c1 < 0 || r2 >= rows || c2 >= cols || r2 < r1 || c2 < c1) return null;
  return { r1, c1, r2, c2 };
};

/** Validate & upgrade an untrusted/older document into a safe TableSchema. Throws on unrecoverable input. */
export function normalizeSchema(raw: any): TableSchema {
  if (!raw || typeof raw !== 'object' || typeof raw.cells !== 'object' || raw.cells === null) {
    throw new Error('Not a Table Maker document.');
  }
  const base = createDefaultTable();
  const cols = Array.isArray(raw.columns) ? raw.columns.slice(0, MAX_COLS) : [];
  const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, MAX_ROWS) : [];
  const doc: TableSchema = {
    ...base,
    id: typeof raw.id === 'string' ? raw.id : base.id,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : base.title,
    aspectRatio: ['1:sqrt2', 'sqrt2:1', '16:9', '4:3', '1:1', 'custom'].includes(raw.aspectRatio) ? raw.aspectRatio : base.aspectRatio,
    dimensions: {
      columns: 0,
      rows: 0,
      customWidthPx: raw.dimensions?.customWidthPx ? num(raw.dimensions.customWidthPx, 800, 100, 8000) : undefined,
      customHeightPx: raw.dimensions?.customHeightPx ? num(raw.dimensions.customHeightPx, 600, 100, 8000) : undefined,
    },
    styles: {
      ...base.styles,
      themeId: THEMES.some((t) => t.id === raw.styles?.themeId) ? raw.styles.themeId : base.styles.themeId,
      zebra: raw.styles?.zebra ?? base.styles.zebra,
      headerRows: Math.floor(num(raw.styles?.headerRows, base.styles.headerRows, 0, 20)),
      cellPadding: num(raw.styles?.cellPadding, base.styles.cellPadding, 0, 40),
      fontFamily: typeof raw.styles?.fontFamily === 'string' ? raw.styles.fontFamily : base.styles.fontFamily,
      fontSize: num(raw.styles?.fontSize, base.styles.fontSize, 6, 96),
      gridColor: safeColor(raw.styles?.gridColor, ''),
      gridWidth: num(raw.styles?.gridWidth, 1, 0, 8),
      gridStyle: ['solid', 'dashed', 'dotted', 'none'].includes(raw.styles?.gridStyle) ? raw.styles.gridStyle : 'solid',
    },
    canvas: {
      lockMode: ['growth', 'autoscale', 'free'].includes(raw.canvas?.lockMode) ? raw.canvas.lockMode : base.canvas.lockMode,
      bg: safeColor(raw.canvas?.bg, '#ffffff'),
      margin: num(raw.canvas?.margin, base.canvas.margin, 0, 200),
      bleed: num(raw.canvas?.bleed, base.canvas.bleed, 0, 100),
    },
    columns: cols.map((c: any) => ({ width: num(c?.width, DEFAULT_COL_WIDTH, MIN_COL_WIDTH, 2000) })),
    rows: rows.map((r: any) => ({ height: num(r?.height, DEFAULT_ROW_HEIGHT, MIN_ROW_HEIGHT, 2000) })),
    cells: {},
    mergedRanges: [],
    borders: {},
    conditionalRules: [],
    validations: [],
    filters: [],
    frozen: { rows: 0, cols: 0 },
  };
  // infer missing dimensions from cells
  let maxR = 0;
  let maxC = 0;
  for (const key of Object.keys(raw.cells)) {
    const [r, c] = parseKey(key);
    if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0) {
      maxR = Math.max(maxR, r + 1);
      maxC = Math.max(maxC, c + 1);
    }
  }
  while (doc.columns.length < Math.min(MAX_COLS, Math.max(1, maxC))) doc.columns.push({ width: DEFAULT_COL_WIDTH });
  while (doc.rows.length < Math.min(MAX_ROWS, Math.max(1, maxR))) doc.rows.push({ height: DEFAULT_ROW_HEIGHT });
  const R = doc.rows.length;
  const C = doc.columns.length;
  doc.dimensions.rows = R;
  doc.dimensions.columns = C;

  for (const [key, c] of Object.entries<any>(raw.cells)) {
    const [r, col] = parseKey(key);
    if (!(r >= 0 && r < R && col >= 0 && col < C) || !c || typeof c !== 'object') continue;
    const cell: CellData = {
      value: c.value === undefined || c.value === null ? '' : String(c.value).slice(0, 50_000),
      type: ['text', 'number', 'image', 'boolean', 'date'].includes(c.type) ? c.type : 'text',
    };
    if (cell.type === 'text') cell.type = inferType(cell.value) === 'text' ? 'text' : inferType(cell.value);
    if (c.style && typeof c.style === 'object') {
      const s = c.style;
      cell.style = {};
      for (const k of ['bold', 'italic', 'underline', 'strike', 'wrap'] as const) if (typeof s[k] === 'boolean') cell.style[k] = s[k];
      if (safeColor(s.color)) cell.style.color = safeColor(s.color);
      if (safeColor(s.bg)) cell.style.bg = safeColor(s.bg);
      if (typeof s.fontFamily === 'string') cell.style.fontFamily = s.fontFamily;
      if (typeof s.fontSize === 'number') cell.style.fontSize = num(s.fontSize, 14, 6, 96);
      if (['left', 'center', 'right'].includes(s.align)) cell.style.align = s.align;
      if (['top', 'middle', 'bottom'].includes(s.valign)) cell.style.valign = s.valign;
      if (['bullet', 'number'].includes(s.list)) cell.style.list = s.list;
      if (typeof s.padding === 'number') cell.style.padding = num(s.padding, 8, 0, 40);
      if (!Object.keys(cell.style).length) delete cell.style;
    }
    if (c.imageConfig && isSafeImageSrc(c.imageConfig.src)) {
      cell.imageConfig = {
        src: c.imageConfig.src,
        fitMode: ['contain', 'cover', 'stretch', 'original', 'center'].includes(c.imageConfig.fitMode) ? c.imageConfig.fitMode : 'contain',
        altText: typeof c.imageConfig.altText === 'string' ? c.imageConfig.altText : undefined,
        naturalWidth: typeof c.imageConfig.naturalWidth === 'number' ? c.imageConfig.naturalWidth : undefined,
        naturalHeight: typeof c.imageConfig.naturalHeight === 'number' ? c.imageConfig.naturalHeight : undefined,
      };
    } else if (cell.type === 'image') cell.type = 'text';
    if (typeof c.comment === 'string') cell.comment = c.comment.slice(0, 2000);
    doc.cells[cellKey(r, col)] = cell;
  }

  doc.mergedRanges = (Array.isArray(raw.mergedRanges) ? raw.mergedRanges : [])
    .map((m: any) => asRange(m, R, C))
    .filter((m: CellRange | null): m is CellRange => !!m && (m.r1 !== m.r2 || m.c1 !== m.c2));
  for (const [k, b] of Object.entries<any>(raw.borders ?? {})) {
    if (/^[hv]:\d+:\d+$/.test(k) && b && typeof b === 'object') {
      doc.borders[k] = {
        width: num(b.width, 1, 0, 12),
        style: ['solid', 'dashed', 'dotted'].includes(b.style) ? b.style : 'solid',
        color: safeColor(b.color, '#000000'),
      };
    }
  }
  for (const v of Array.isArray(raw.validations) ? raw.validations : []) {
    const range = asRange(v?.range, R, C);
    if (range && ['text', 'number', 'select', 'date', 'email', 'url', 'checkbox'].includes(v.type))
      doc.validations.push({
        id: String(v.id ?? `v${doc.validations.length}`),
        range,
        type: v.type,
        options: Array.isArray(v.options) ? v.options.map(String).slice(0, 200) : undefined,
        min: typeof v.min === 'number' ? v.min : undefined,
        max: typeof v.max === 'number' ? v.max : undefined,
      });
  }
  for (const rule of Array.isArray(raw.conditionalRules) ? raw.conditionalRules : []) {
    const range = asRange(rule?.range, R, C);
    if (range && ['gt', 'lt', 'eq', 'contains', 'between', 'dateBetween', 'colorScale', 'dataBar'].includes(rule.op))
      doc.conditionalRules.push({
        id: String(rule.id ?? `cf${doc.conditionalRules.length}`),
        range,
        op: rule.op,
        value: rule.value === undefined ? undefined : String(rule.value),
        value2: rule.value2 === undefined ? undefined : String(rule.value2),
        style: rule.style
          ? { bg: safeColor(rule.style.bg) || undefined, color: safeColor(rule.style.color) || undefined, bold: !!rule.style.bold || undefined }
          : undefined,
        scale: rule.scale ? { min: safeColor(rule.scale.min, '#ffffff'), max: safeColor(rule.scale.max, '#2f5bea') } : undefined,
        barColor: safeColor(rule.barColor) || undefined,
      });
  }
  for (const f of Array.isArray(raw.filters) ? raw.filters : []) {
    if (Number.isInteger(f?.col) && f.col >= 0 && f.col < C)
      doc.filters.push({ id: String(f.id ?? `f${doc.filters.length}`), col: f.col, op: f.op, value: f.value, value2: f.value2 });
  }
  doc.frozen = {
    rows: Math.floor(num(raw.frozen?.rows, 0, 0, Math.max(0, R - 1))),
    cols: Math.floor(num(raw.frozen?.cols, 0, 0, Math.max(0, C - 1))),
  };
  return doc;
}

/** Build a table from a 2-D array of strings (CSV / Markdown / XLSX / JSON-array imports). */
export function matrixToTable(matrix: string[][], title = 'Imported table'): TableSchema {
  const rows = Math.min(MAX_ROWS, Math.max(1, matrix.length));
  const cols = Math.min(MAX_COLS, Math.max(1, ...matrix.map((r) => r.length)));
  const doc = createDefaultTable({ rows, cols });
  doc.title = title;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const v = matrix[r]?.[c];
      if (v !== undefined && v !== '') doc.cells[cellKey(r, c)] = { value: v, type: inferType(v) };
    }
  for (let c = 0; c < cols; c++) {
    let longest = 6;
    for (let r = 0; r < Math.min(rows, 60); r++) longest = Math.max(longest, Math.min(40, (matrix[r]?.[c] ?? '').split('\n')[0].length));
    doc.columns[c].width = Math.round(Math.min(260, Math.max(70, longest * 8 + 24)));
  }
  return doc;
}
