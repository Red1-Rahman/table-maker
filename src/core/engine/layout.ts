import type { TableSchema } from '@/types/schema';
import { displayText, numericValue } from './evaluate';

export interface Layout {
  colX: number[]; // length cols+1
  rowY: number[]; // length rows+1
  width: number;
  height: number;
  hidden: Set<number>;
}

const hiddenCache = new WeakMap<object, Set<number>>();
const layoutCache = new WeakMap<object, Layout>();

export function computeHiddenRows(doc: TableSchema): Set<number> {
  if (doc.filters.length === 0) return EMPTY;
  const hit = hiddenCache.get(doc);
  if (hit) return hit;
  const hidden = new Set<number>();
  for (let r = doc.styles.headerRows; r < doc.rows.length; r++) {
    for (const f of doc.filters) {
      if (!passes(doc, r, f)) {
        hidden.add(r);
        break;
      }
    }
  }
  hiddenCache.set(doc, hidden);
  return hidden;
}
const EMPTY = new Set<number>();

function passes(doc: TableSchema, r: number, f: TableSchema['filters'][number]): boolean {
  const text = displayText(doc, r, f.col);
  const lower = text.toLowerCase();
  const num = numericValue(doc, r, f.col) ?? (text.trim() !== '' && !Number.isNaN(Number(text)) ? Number(text) : null);
  const v1 = f.value ?? '';
  switch (f.op) {
    case 'contains':
      return lower.includes(v1.toLowerCase());
    case 'notContains':
      return !lower.includes(v1.toLowerCase());
    case 'eq':
      return !Number.isNaN(Number(v1)) && v1.trim() !== '' && num !== null ? num === Number(v1) : lower === v1.toLowerCase();
    case 'gt':
      return num !== null && num > Number(v1);
    case 'lt':
      return num !== null && num < Number(v1);
    case 'between':
      return num !== null && num >= Number(v1) && num <= Number(f.value2 ?? v1);
    case 'checked':
      return lower === 'true';
    case 'unchecked':
      return lower !== 'true';
    case 'notEmpty':
      return text.trim() !== '';
  }
}

export function computeLayout(doc: TableSchema): Layout {
  const hit = layoutCache.get(doc);
  if (hit) return hit;
  const hidden = computeHiddenRows(doc);
  const colX = [0];
  for (const c of doc.columns) colX.push(colX[colX.length - 1] + c.width);
  const rowY = [0];
  doc.rows.forEach((row, i) => rowY.push(rowY[rowY.length - 1] + (hidden.has(i) ? 0 : row.height)));
  const layout = { colX, rowY, width: colX[colX.length - 1], height: rowY[rowY.length - 1], hidden };
  layoutCache.set(doc, layout);
  return layout;
}

/** Largest index i such that arr[i] <= v, clamped to a valid cell index (0..arr.length-2). */
export function indexAt(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
