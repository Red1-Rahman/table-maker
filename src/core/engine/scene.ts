/**
 * Scene builder: turns a TableSchema into drawable primitives (cell boxes + border segments)
 * in table-local pixel coordinates. Used by the DOM grid, PNG painter and PDF painter so that
 * every output renders identically.
 */
import type { BorderSpec, CellRange, TableSchema } from '@/types/schema';
import { cellKey } from '@/types/schema';
import { type Layout, computeLayout, indexAt } from './layout';
import { type ResolvedCell, gridLineColor, resolveCell } from './resolve';

export interface CellBox {
  r: number;
  c: number;
  rowSpan: number;
  colSpan: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cell: ResolvedCell;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  spec: BorderSpec;
}

export interface Scene {
  boxes: CellBox[];
  edges: Segment[];
  layout: Layout;
}

export interface Region {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const mergeIndexCache = new WeakMap<object, Map<string, CellRange>>();

export function mergeIndex(doc: Pick<TableSchema, 'mergedRanges'>): Map<string, CellRange> {
  let idx = mergeIndexCache.get(doc.mergedRanges);
  if (!idx) {
    idx = new Map();
    for (const m of doc.mergedRanges)
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) idx.set(cellKey(r, c), m);
    mergeIndexCache.set(doc.mergedRanges, idx);
  }
  return idx;
}

/** Resolve the effective border for an edge key: explicit override, else the theme grid, else none. */
export function resolveEdge(doc: TableSchema, key: string): BorderSpec | null {
  const o = doc.borders[key];
  if (o) return o.width > 0 ? o : null;
  if (doc.styles.gridStyle === 'none' || doc.styles.gridWidth <= 0) return null;
  return { width: doc.styles.gridWidth, style: doc.styles.gridStyle, color: gridLineColor(doc) };
}

const sameSpec = (a: BorderSpec, b: BorderSpec) => a.width === b.width && a.style === b.style && a.color === b.color;

export function buildScene(doc: TableSchema, region?: Region, overscan = 1): Scene {
  const layout = computeLayout(doc);
  const nRows = doc.rows.length;
  const nCols = doc.columns.length;
  const r0 = region ? Math.max(0, indexAt(layout.rowY, region.y1) - overscan) : 0;
  const r1 = region ? Math.min(nRows - 1, indexAt(layout.rowY, region.y2) + overscan) : nRows - 1;
  const c0 = region ? Math.max(0, indexAt(layout.colX, region.x1) - overscan) : 0;
  const c1 = region ? Math.min(nCols - 1, indexAt(layout.colX, region.x2) + overscan) : nCols - 1;
  const midx = mergeIndex(doc);

  // ---- cell boxes
  const boxes: CellBox[] = [];
  const seenMerges = new Set<CellRange>();
  const pushBox = (r: number, c: number, rowSpan: number, colSpan: number) => {
    const x = layout.colX[c];
    const y = layout.rowY[r];
    const w = layout.colX[c + colSpan] - x;
    const h = layout.rowY[r + rowSpan] - y;
    if (w <= 0 || h <= 0) return;
    boxes.push({ r, c, rowSpan, colSpan, x, y, w, h, cell: resolveCell(doc, r, c) });
  };
  for (let r = r0; r <= r1; r++) {
    if (layout.hidden.has(r)) continue;
    for (let c = c0; c <= c1; c++) {
      const m = midx.get(cellKey(r, c));
      if (m) {
        if (seenMerges.has(m)) continue;
        seenMerges.add(m);
        pushBox(m.r1, m.c1, m.r2 - m.r1 + 1, m.c2 - m.c1 + 1);
      } else pushBox(r, c, 1, 1);
    }
  }

  // ---- edges
  const edges: Segment[] = [];
  const specFor = (key: string): BorderSpec | null => resolveEdge(doc, key);
  const insideMerge = (kind: 'h' | 'v', b: number, along: number): boolean => {
    // is the edge strictly interior to a merged range?
    const m = kind === 'h' ? midx.get(cellKey(b, along)) : midx.get(cellKey(along, b));
    if (!m) return false;
    return kind === 'h' ? m.r1 < b && b <= m.r2 : m.c1 < b && b <= m.c2;
  };
  // horizontal edges
  for (let b = r0; b <= r1 + 1; b++) {
    const visible = (i: number) => i >= 0 && i < nRows && !layout.hidden.has(i);
    if (!visible(b) && !visible(b - 1)) continue;
    const y = layout.rowY[b];
    let cur: Segment | null = null;
    for (let c = c0; c <= c1; c++) {
      const spec = insideMerge('h', b, c) ? null : specFor(`h:${b}:${c}`);
      if (spec && cur && sameSpec(cur.spec, spec) && cur.x2 === layout.colX[c]) cur.x2 = layout.colX[c + 1];
      else {
        if (cur) edges.push(cur);
        cur = spec ? { x1: layout.colX[c], y1: y, x2: layout.colX[c + 1], y2: y, spec } : null;
      }
    }
    if (cur) edges.push(cur);
  }
  // vertical edges
  for (let b = c0; b <= c1 + 1; b++) {
    const x = layout.colX[b];
    let cur: Segment | null = null;
    for (let r = r0; r <= r1; r++) {
      if (layout.hidden.has(r)) continue;
      const spec = insideMerge('v', b, r) ? null : specFor(`v:${r}:${b}`);
      if (spec && cur && sameSpec(cur.spec, spec) && cur.y2 === layout.rowY[r]) cur.y2 = layout.rowY[r + 1];
      else {
        if (cur) edges.push(cur);
        cur = spec ? { x1: x, y1: layout.rowY[r], x2: x, y2: layout.rowY[r + 1], spec } : null;
      }
    }
    if (cur) edges.push(cur);
  }
  return { boxes, edges, layout };
}
