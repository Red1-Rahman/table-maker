/**
 * Aspect-ratio / canvas math. Pure TypeScript, no React.
 * All sizes are CSS pixels at 96 DPI (A-series width 794px ≈ 210mm).
 */
import type { AspectRatioId, LockMode, TableSchema } from '@/types/schema';

export const A_WIDTH = 794;
export const SQRT2 = Math.SQRT2;
export const MIN_SCALE = 0.05;

export interface RatioInfo {
  id: AspectRatioId;
  label: string;
  short: string;
}

export const RATIOS: RatioInfo[] = [
  { id: '1:sqrt2', label: 'A-series portrait (1 : √2)', short: 'A · portrait' },
  { id: 'sqrt2:1', label: 'A-series landscape (√2 : 1)', short: 'A · landscape' },
  { id: '16:9', label: 'Widescreen (16 : 9)', short: '16 : 9' },
  { id: '4:3', label: 'Standard (4 : 3)', short: '4 : 3' },
  { id: '1:1', label: 'Square (1 : 1)', short: '1 : 1' },
  { id: 'custom', label: 'Custom size', short: 'Custom' },
];

export interface PageSize {
  w: number;
  h: number;
}

export function getPageSize(ratio: AspectRatioId, custom?: { w?: number; h?: number }): PageSize {
  switch (ratio) {
    case '1:sqrt2':
      return { w: A_WIDTH, h: A_WIDTH * SQRT2 };
    case 'sqrt2:1':
      return { w: A_WIDTH * SQRT2, h: A_WIDTH };
    case '16:9':
      return { w: 1280, h: 720 };
    case '4:3':
      return { w: 1024, h: 768 };
    case '1:1':
      return { w: 900, h: 900 };
    default:
      return { w: clampDim(custom?.w ?? 800), h: clampDim(custom?.h ?? 600) };
  }
}

const clampDim = (n: number) => Math.min(8000, Math.max(100, Math.round(n)));

export interface CanvasLayout {
  pageW: number;
  pageH: number;
  /** base (single-page) size */
  baseW: number;
  baseH: number;
  margin: number;
  availW: number;
  availH: number;
  tableW: number;
  tableH: number;
  /** content scale applied to the table (autoscale mode) */
  tableScale: number;
  pages: number;
  overflow: boolean;
  lockMode: LockMode;
}

export function computeCanvasLayout(
  doc: Pick<TableSchema, 'aspectRatio' | 'dimensions' | 'canvas'>,
  tableW: number,
  tableH: number,
): CanvasLayout {
  const base = getPageSize(doc.aspectRatio, { w: doc.dimensions.customWidthPx, h: doc.dimensions.customHeightPx });
  const m = doc.canvas.margin;
  const availW = Math.max(10, base.w - 2 * m);
  const availH = Math.max(10, base.h - 2 * m);
  const lockMode = doc.canvas.lockMode;
  let pageW = base.w;
  let pageH = base.h;
  let tableScale = 1;
  let pages = 1;
  if (lockMode === 'autoscale') {
    tableScale = Math.max(MIN_SCALE, Math.min(1, availW / Math.max(1, tableW), availH / Math.max(1, tableH)));
  } else if (lockMode === 'free') {
    pageW = Math.max(base.w, tableW + 2 * m);
    pages = Math.max(1, Math.ceil((tableH + 2 * m) / base.h - 1e-9));
    pageH = pages * base.h;
  }
  const overflow = tableW > availW + 0.5 || tableH > availH + 0.5;
  return { pageW, pageH, baseW: base.w, baseH: base.h, margin: m, availW, availH, tableW, tableH, tableScale, pages, overflow, lockMode };
}

/** Remaining room (px) in growth-lock mode, never negative. */
export function remainingRoom(layout: CanvasLayout): { w: number; h: number } {
  return { w: Math.max(0, layout.availW - layout.tableW), h: Math.max(0, layout.availH - layout.tableH) };
}

/** Zoom factor that fits the whole page inside a viewport. */
export function fitZoom(pageW: number, pageH: number, viewW: number, viewH: number, pad = 96): number {
  const z = Math.min((viewW - pad) / pageW, (viewH - pad) / pageH);
  return Math.min(5, Math.max(0.1, Number.isFinite(z) ? z : 1));
}

export function ratioLabel(id: AspectRatioId): string {
  return RATIOS.find((r) => r.id === id)?.short ?? id;
}
