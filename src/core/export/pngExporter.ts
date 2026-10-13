import { computeCanvasLayout } from '@/core/engine/canvasRatio';
import { computeLayout } from '@/core/engine/layout';
import type { TableSchema } from '@/types/schema';
import { canvasToBytes, renderRegionToCanvas, safePixelRatio } from './canvasPainter';

export async function exportPng(doc: TableSchema, pixelRatio = 3): Promise<Uint8Array> {
  const tl = computeLayout(doc);
  const cl = computeCanvasLayout(doc, tl.width, tl.height);
  const pr = safePixelRatio(pixelRatio, cl.pageW, cl.pageH);
  const canvas = await renderRegionToCanvas(doc, { x: 0, y: 0, w: cl.pageW, h: cl.pageH }, pr);
  return canvasToBytes(canvas, 'image/png');
}
