/**
 * Matrix manipulation utilities (insert, delete, move, merge, split, sort, style).
 * All functions mutate the passed document and are safe to call on an Immer draft.
 * Pure TypeScript — no React.
 */
import type {
  BorderSpec,
  CellData,
  CellRange,
  CellStyle,
  CellType,
  ImageConfig,
  TableSchema,
} from '@/types/schema';
import { cellKey, parseKey } from '@/types/schema';
import { rangeCells, rangeContains, rangesIntersect } from './address';
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from './defaults';
import { createEvaluator, parseLiteral, shiftFormulaRefs, type Scalar, FormulaErr } from './formulaEngine';

export type Axis = 'row' | 'col';
export const MAX_ROWS = 2000;
export const MAX_COLS = 200;

// ------------------------------------------------------------ cell basics

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function inferType(value: string): CellType {
  const t = value.trim();
  if (t === '') return 'text';
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return 'number';
  if (ISO_DATE.test(t) && !Number.isNaN(Date.parse(t))) return 'date';
  return 'text';
}

export const getCell = (doc: TableSchema, r: number, c: number): CellData | undefined => doc.cells[cellKey(r, c)];

function pruneCell(doc: TableSchema, key: string) {
  const cell = doc.cells[key];
  if (cell && cell.value === '' && !cell.style && !cell.imageConfig && !cell.comment) delete doc.cells[key];
}

export function ensureCell(doc: TableSchema, r: number, c: number): CellData {
  const key = cellKey(r, c);
  let cell = doc.cells[key];
  if (!cell) {
    cell = { value: '', type: 'text' };
    doc.cells[key] = cell;
  }
  return cell;
}

export function setCellValue(doc: TableSchema, r: number, c: number, value: string) {
  const key = cellKey(r, c);
  const existing = doc.cells[key];
  if (!existing && value === '') return;
  const cell = ensureCell(doc, r, c);
  cell.value = value;
  if (cell.type === 'boolean' && /^(true|false)$/i.test(value.trim())) {
    cell.value = value.trim().toUpperCase();
  } else {
    if (cell.type === 'image') delete cell.imageConfig;
    cell.type = inferType(value);
  }
  pruneCell(doc, key);
}

export function setImage(doc: TableSchema, r: number, c: number, cfg: ImageConfig) {
  const cell = ensureCell(doc, r, c);
  cell.type = 'image';
  cell.imageConfig = cfg;
  cell.value = cfg.altText ?? '';
}

export function setImageFit(doc: TableSchema, r: number, c: number, fit: ImageConfig['fitMode']) {
  const cell = doc.cells[cellKey(r, c)];
  if (cell?.imageConfig) cell.imageConfig.fitMode = fit;
}

export function setCheckbox(doc: TableSchema, r: number, c: number, checked: boolean) {
  const cell = ensureCell(doc, r, c);
  cell.type = 'boolean';
  cell.value = checked ? 'TRUE' : 'FALSE';
}

// ------------------------------------------------------------------ merges

export function findMerge(doc: Pick<TableSchema, 'mergedRanges'>, r: number, c: number): CellRange | undefined {
  for (const m of doc.mergedRanges) if (rangeContains(m, r, c)) return m;
  return undefined;
}

export function resolveOrigin(doc: Pick<TableSchema, 'mergedRanges'>, r: number, c: number): { r: number; c: number } {
  const m = findMerge(doc, r, c);
  return m ? { r: m.r1, c: m.c1 } : { r, c };
}

export function mergeRange(doc: TableSchema, rg: CellRange): boolean {
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2) return false;
  doc.mergedRanges = doc.mergedRanges.filter((m) => !rangesIntersect(m, rg));
  const pk = cellKey(rg.r1, rg.c1);
  const primary = doc.cells[pk];
  const primaryEmpty = !primary || (primary.value === '' && !primary.imageConfig);
  let donor: CellData | undefined;
  for (let r = rg.r1; r <= rg.r2; r++) {
    for (let c = rg.c1; c <= rg.c2; c++) {
      if (r === rg.r1 && c === rg.c1) continue;
      const k = cellKey(r, c);
      const cell = doc.cells[k];
      if (cell && !donor && (cell.value !== '' || cell.imageConfig)) donor = JSON.parse(JSON.stringify(cell));
      delete doc.cells[k];
    }
  }
  if (primaryEmpty && donor) {
    doc.cells[pk] = { ...donor, style: primary?.style ?? donor.style };
  }
  doc.mergedRanges.push({ ...rg });
  return true;
}

export function unmergeAt(doc: TableSchema, r: number, c: number): boolean {
  const before = doc.mergedRanges.length;
  doc.mergedRanges = doc.mergedRanges.filter((m) => !rangeContains(m, r, c));
  return doc.mergedRanges.length !== before;
}

export function unmergeRange(doc: TableSchema, rg: CellRange): number {
  const before = doc.mergedRanges.length;
  doc.mergedRanges = doc.mergedRanges.filter((m) => !rangesIntersect(m, rg));
  return before - doc.mergedRanges.length;
}

// ------------------------------------------------- insert / delete / move

export function remapRange(rg: CellRange, axis: Axis, mode: 'insert' | 'delete', at: number, n: number): CellRange | null {
  const lo = axis === 'row' ? rg.r1 : rg.c1;
  const hi = axis === 'row' ? rg.r2 : rg.c2;
  let nlo: number;
  let nhi: number;
  if (mode === 'insert') {
    nlo = lo >= at ? lo + n : lo;
    nhi = hi >= at ? hi + n : hi;
  } else {
    const end = at + n;
    if (lo >= at && hi < end) return null;
    nlo = lo >= end ? lo - n : lo >= at ? at : lo;
    nhi = hi >= end ? hi - n : hi >= at ? at - 1 : hi;
  }
  if (nhi < nlo) return null;
  return axis === 'row' ? { ...rg, r1: nlo, r2: nhi } : { ...rg, c1: nlo, c2: nhi };
}

const mapCellIndex = (mode: 'insert' | 'delete', at: number, n: number) => (i: number): number | null => {
  if (mode === 'insert') return i >= at ? i + n : i;
  if (i >= at && i < at + n) return null;
  return i >= at + n ? i - n : i;
};

const mapBoundary = (mode: 'insert' | 'delete', at: number, n: number) => (b: number): number | null => {
  if (mode === 'insert') return b > at ? b + n : b;
  if (b > at && b <= at + n) return null;
  return b > at + n ? b - n : b;
};

function syncDims(doc: TableSchema) {
  doc.dimensions.rows = doc.rows.length;
  doc.dimensions.columns = doc.columns.length;
  doc.frozen.rows = Math.min(doc.frozen.rows, Math.max(0, doc.rows.length - 1));
  doc.frozen.cols = Math.min(doc.frozen.cols, Math.max(0, doc.columns.length - 1));
}

function shiftAxis(doc: TableSchema, axis: Axis, mode: 'insert' | 'delete', at: number, n: number, size?: number) {
  const mc = mapCellIndex(mode, at, n);
  const mb = mapBoundary(mode, at, n);

  // cells
  const cells: Record<string, CellData> = {};
  for (const [key, cell] of Object.entries(doc.cells)) {
    const [r, c] = parseKey(key);
    const ni = mc(axis === 'row' ? r : c);
    if (ni === null) continue;
    cells[axis === 'row' ? cellKey(ni, c) : cellKey(r, ni)] = cell;
  }
  doc.cells = cells;
  for (const cell of Object.values(doc.cells)) {
    if (cell.value.startsWith('=')) cell.value = shiftFormulaRefs(cell.value, axis, mode, at, n);
  }

  // size arrays
  if (axis === 'row') {
    if (mode === 'insert') {
      const h = size ?? doc.rows[Math.min(at, doc.rows.length - 1)]?.height ?? DEFAULT_ROW_HEIGHT;
      doc.rows.splice(at, 0, ...Array.from({ length: n }, () => ({ height: h })));
    } else doc.rows.splice(at, n);
  } else if (mode === 'insert') {
    const w = size ?? doc.columns[Math.min(at, doc.columns.length - 1)]?.width ?? DEFAULT_COL_WIDTH;
    doc.columns.splice(at, 0, ...Array.from({ length: n }, () => ({ width: w })));
  } else doc.columns.splice(at, n);

  // ranges
  const fixRanges = <T extends { range: CellRange }>(list: T[]): T[] =>
    list.flatMap((item) => {
      const rg = remapRange(item.range, axis, mode, at, n);
      return rg ? [{ ...item, range: rg }] : [];
    });
  doc.validations = fixRanges(doc.validations);
  doc.conditionalRules = fixRanges(doc.conditionalRules);
  doc.mergedRanges = doc.mergedRanges.flatMap((m) => {
    const rg = remapRange(m, axis, mode, at, n);
    return rg && !(rg.r1 === rg.r2 && rg.c1 === rg.c2) ? [rg] : [];
  });

  // filters (column based)
  if (axis === 'col') {
    doc.filters = doc.filters.flatMap((f) => {
      const ni = mc(f.col);
      return ni === null ? [] : [{ ...f, col: ni }];
    });
  }

  // borders
  const borders: Record<string, BorderSpec> = {};
  for (const [key, spec] of Object.entries(doc.borders)) {
    const [kind, rs, cs] = key.split(':');
    const r = Number(rs);
    const c = Number(cs);
    let nr = r;
    let nc = c;
    if (axis === 'row') {
      const v = kind === 'h' ? mb(r) : mc(r);
      if (v === null) continue;
      nr = v;
    } else {
      const v = kind === 'v' ? mb(c) : mc(c);
      if (v === null) continue;
      nc = v;
    }
    borders[`${kind}:${nr}:${nc}`] = spec;
  }
  doc.borders = borders;
  syncDims(doc);
}

export function insertRows(doc: TableSchema, at: number, count = 1, height?: number): boolean {
  if (doc.rows.length + count > MAX_ROWS) return false;
  shiftAxis(doc, 'row', 'insert', Math.max(0, Math.min(at, doc.rows.length)), count, height);
  return true;
}
export function insertCols(doc: TableSchema, at: number, count = 1, width?: number): boolean {
  if (doc.columns.length + count > MAX_COLS) return false;
  shiftAxis(doc, 'col', 'insert', Math.max(0, Math.min(at, doc.columns.length)), count, width);
  return true;
}
export function deleteRows(doc: TableSchema, from: number, count = 1): boolean {
  if (count >= doc.rows.length || from < 0 || from + count > doc.rows.length) return false;
  shiftAxis(doc, 'row', 'delete', from, count);
  return true;
}
export function deleteCols(doc: TableSchema, from: number, count = 1): boolean {
  if (count >= doc.columns.length || from < 0 || from + count > doc.columns.length) return false;
  shiftAxis(doc, 'col', 'delete', from, count);
  return true;
}

/** Move row/column `from` so that it ends up at index `to`. Returns an error message or null. */
export function moveLine(doc: TableSchema, axis: Axis, from: number, to: number): string | null {
  const n = axis === 'row' ? doc.rows.length : doc.columns.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return null;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  for (const m of doc.mergedRanges) {
    const a = axis === 'row' ? m.r1 : m.c1;
    const b = axis === 'row' ? m.r2 : m.c2;
    if (b >= lo && a <= hi) return 'Unmerge cells before reordering across them.';
  }
  const order = Array.from({ length: n }, (_, i) => i);
  order.splice(from, 1);
  order.splice(to, 0, from);
  const newPos = new Array<number>(n);
  order.forEach((old, pos) => {
    newPos[old] = pos;
  });
  const cells: Record<string, CellData> = {};
  for (const [key, cell] of Object.entries(doc.cells)) {
    const [r, c] = parseKey(key);
    cells[axis === 'row' ? cellKey(newPos[r], c) : cellKey(r, newPos[c])] = cell;
  }
  doc.cells = cells;
  if (axis === 'row') doc.rows = order.map((o) => doc.rows[o]);
  else doc.columns = order.map((o) => doc.columns[o]);
  const borders: Record<string, BorderSpec> = {};
  for (const [key, spec] of Object.entries(doc.borders)) {
    const [kind, rs, cs] = key.split(':');
    let r = Number(rs);
    let c = Number(cs);
    if (axis === 'row') {
      if (kind === 'h') {
        if (r >= lo && r <= hi + 1) continue; // boundary overrides inside the moved block are dropped
      } else r = newPos[r];
    } else if (kind === 'v') {
      if (c >= lo && c <= hi + 1) continue;
    } else c = newPos[c];
    borders[`${kind}:${r}:${c}`] = spec;
  }
  doc.borders = borders;
  const remap = (rg: CellRange): CellRange => ({ ...rg });
  doc.validations = doc.validations.map((v) => ({ ...v, range: remap(v.range) }));
  return null;
}

// ----------------------------------------------------------------- sorting

export function sortRows(doc: TableSchema, col: number, dir: 'asc' | 'desc', startRow = doc.styles.headerRows): string | null {
  const total = doc.rows.length;
  if (startRow >= total - 1) return null;
  for (const m of doc.mergedRanges) {
    if (m.r2 >= startRow && m.r1 !== m.r2) return 'Unmerge multi-row merged cells before sorting.';
  }
  const evaluator = createEvaluator((r, c) => doc.cells[cellKey(r, c)]?.value);
  const idx = Array.from({ length: total - startRow }, (_, i) => i + startRow);
  const keyOf = (r: number): Scalar => evaluator.get(r, col);
  const cmp = (a: number, b: number): number => {
    const x = keyOf(a);
    const y = keyOf(b);
    const xe = x === '' || x instanceof FormulaErr;
    const ye = y === '' || y instanceof FormulaErr;
    if (xe || ye) return xe && ye ? 0 : xe ? 1 : -1; // blanks always last
    let res: number;
    if (typeof x === 'number' && typeof y === 'number') res = x - y;
    else if (typeof x === 'number') res = -1;
    else if (typeof y === 'number') res = 1;
    else res = String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    return dir === 'asc' ? res : -res;
  };
  const sorted = [...idx].sort((a, b) => cmp(a, b) || a - b);
  const newPos = new Map<number, number>();
  sorted.forEach((old, i) => newPos.set(old, startRow + i));
  const cells: Record<string, CellData> = {};
  for (const [key, cell] of Object.entries(doc.cells)) {
    const [r, c] = parseKey(key);
    cells[cellKey(newPos.get(r) ?? r, c)] = cell;
  }
  doc.cells = cells;
  const oldRows = doc.rows.slice();
  sorted.forEach((old, i) => {
    doc.rows[startRow + i] = oldRows[old];
  });
  doc.mergedRanges = doc.mergedRanges.map((m) => (m.r1 >= startRow ? { ...m, r1: newPos.get(m.r1) ?? m.r1, r2: newPos.get(m.r2) ?? m.r2 } : m));
  return null;
}

// ------------------------------------------------------------------ styling

export function forEachCell(rg: CellRange, fn: (r: number, c: number) => void, limit = 40_000) {
  if (rangeCells(rg) > limit) return;
  for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) fn(r, c);
}

export function applyStyle(doc: TableSchema, rg: CellRange, patch: Partial<CellStyle>) {
  forEachCell(rg, (r, c) => {
    const cell = ensureCell(doc, r, c);
    const next: CellStyle = { ...(cell.style ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (next as Record<string, unknown>)[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(next).length) cell.style = next;
    else delete cell.style;
    pruneCell(doc, cellKey(r, c));
  });
}

export function toggleStyle(doc: TableSchema, rg: CellRange, key: 'bold' | 'italic' | 'underline' | 'strike') {
  const current = !!doc.cells[cellKey(rg.r1, rg.c1)]?.style?.[key];
  applyStyle(doc, rg, { [key]: current ? undefined : true });
}

export function clearRange(doc: TableSchema, rg: CellRange, what: 'content' | 'format' | 'all' = 'content') {
  forEachCell(rg, (r, c) => {
    const key = cellKey(r, c);
    const cell = doc.cells[key];
    if (!cell) return;
    if (what === 'all') {
      delete doc.cells[key];
      return;
    }
    if (what === 'content') {
      cell.value = '';
      cell.type = 'text';
      delete cell.imageConfig;
    } else delete cell.style;
    pruneCell(doc, key);
  });
}

export type BorderMode = 'all' | 'outer' | 'inner' | 'horizontal' | 'vertical' | 'top' | 'bottom' | 'left' | 'right';

/** spec === null removes the override (falls back to theme grid); width 0 hides the edge. */
export function applyBorders(doc: TableSchema, rg: CellRange, mode: BorderMode, spec: BorderSpec | null) {
  const set = (key: string) => {
    if (spec === null) delete doc.borders[key];
    else doc.borders[key] = { ...spec };
  };
  const top = mode === 'top' || mode === 'outer' || mode === 'all';
  const bottom = mode === 'bottom' || mode === 'outer' || mode === 'all';
  const left = mode === 'left' || mode === 'outer' || mode === 'all';
  const right = mode === 'right' || mode === 'outer' || mode === 'all';
  const innerH = mode === 'inner' || mode === 'horizontal' || mode === 'all';
  const innerV = mode === 'inner' || mode === 'vertical' || mode === 'all';
  for (let c = rg.c1; c <= rg.c2; c++) {
    if (top) set(`h:${rg.r1}:${c}`);
    if (bottom) set(`h:${rg.r2 + 1}:${c}`);
    if (innerH) for (let r = rg.r1 + 1; r <= rg.r2; r++) set(`h:${r}:${c}`);
  }
  for (let r = rg.r1; r <= rg.r2; r++) {
    if (left) set(`v:${r}:${rg.c1}`);
    if (right) set(`v:${r}:${rg.c2 + 1}`);
    if (innerV) for (let c = rg.c1 + 1; c <= rg.c2; c++) set(`v:${r}:${c}`);
  }
}

// -------------------------------------------------------------- paste / size

export interface PasteCell {
  value: string;
  type?: CellType;
  style?: CellStyle;
  imageConfig?: ImageConfig;
}

export function ensureSize(doc: TableSchema, rows: number, cols: number): boolean {
  if (rows > MAX_ROWS || cols > MAX_COLS) return false;
  while (doc.rows.length < rows) doc.rows.push({ height: doc.rows[doc.rows.length - 1]?.height ?? DEFAULT_ROW_HEIGHT });
  while (doc.columns.length < cols) doc.columns.push({ width: doc.columns[doc.columns.length - 1]?.width ?? DEFAULT_COL_WIDTH });
  syncDims(doc);
  return true;
}

export function pasteBlock(doc: TableSchema, r0: number, c0: number, block: (PasteCell | null)[][]) {
  block.forEach((row, i) =>
    row.forEach((src, j) => {
      const r = r0 + i;
      const c = c0 + j;
      if (r >= doc.rows.length || c >= doc.columns.length) return;
      if (findMerge(doc, r, c) && !(findMerge(doc, r, c)!.r1 === r && findMerge(doc, r, c)!.c1 === c)) return;
      const key = cellKey(r, c);
      if (!src || (src.value === '' && !src.style && !src.imageConfig)) {
        delete doc.cells[key];
        return;
      }
      const cell: CellData = { value: src.value, type: src.type ?? inferType(src.value) };
      if (src.style) cell.style = { ...src.style };
      if (src.imageConfig) cell.imageConfig = { ...src.imageConfig };
      doc.cells[key] = cell;
    }),
  );
}

export function setColumnWidth(doc: TableSchema, c: number, w: number) {
  if (doc.columns[c]) doc.columns[c].width = w;
}
export function setRowHeight(doc: TableSchema, r: number, h: number) {
  if (doc.rows[r]) doc.rows[r].height = h;
}

export { parseLiteral };
