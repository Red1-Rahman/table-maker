import { computeCanvasLayout } from '@/core/engine/canvasRatio';
import { computeLayout } from '@/core/engine/layout';
import { hexToRgb } from '@/core/engine/resolve';
import { buildScene } from '@/core/engine/scene';
import type { TableSchema } from '@/types/schema';
import { canvasToBytes, loadImages, renderRegionToCanvas, safePixelRatio } from './canvasPainter';
import { drawSceneToPdf, prepareImages } from './pdfPainter';

/** Characters the built-in PDF fonts can render (Latin-1 + common punctuation). */
const PDF_SAFE = /^[\u0000-\u00FF\u2010-\u2022\u2026\u20AC\u2122]*$/;

export function needsRasterPdf(doc: TableSchema): boolean {
  return Object.values(doc.cells).some((c) => c.type !== 'image' && !PDF_SAFE.test(c.value));
}

export interface PdfExportOptions {
  pixelRatio?: number;
  mode?: 'auto' | 'vector' | 'raster';
}

export async function exportPdf(doc: TableSchema, opts: PdfExportOptions = {}): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const tl = computeLayout(doc);
  const cl = computeCanvasLayout(doc, tl.width, tl.height);
  const mode = opts.mode && opts.mode !== 'auto' ? opts.mode : needsRasterPdf(doc) ? 'raster' : 'vector';
  const pageWpt = cl.pageW * 0.75;
  const pageHpt = cl.baseH * 0.75;
  const pdf = new jsPDF({
    unit: 'pt',
    format: [pageWpt, pageHpt],
    orientation: pageWpt > pageHpt ? 'landscape' : 'portrait',
    compress: true,
  });
  pdf.setProperties({ title: doc.title, creator: 'Table Maker' });
  const imgs = await loadImages(doc);
  const pr = safePixelRatio(opts.pixelRatio ?? 3, cl.pageW, cl.baseH);

  for (let p = 0; p < cl.pages; p++) {
    if (p > 0) pdf.addPage([pageWpt, pageHpt], pageWpt > pageHpt ? 'landscape' : 'portrait');
    const pageTop = p * cl.baseH;
    if (mode === 'raster') {
      const canvas = await renderRegionToCanvas(doc, { x: 0, y: pageTop, w: cl.pageW, h: cl.baseH }, pr, imgs);
      const bytes = await canvasToBytes(canvas, 'image/png');
      pdf.addImage(bytes, 'PNG', 0, 0, pageWpt, pageHpt, undefined, 'FAST');
      continue;
    }
    const [r, g, b] = hexToRgb(doc.canvas.bg);
    pdf.setFillColor(r, g, b);
    pdf.rect(0, 0, pageWpt, pageHpt, 'F');
    const s = cl.tableScale;
    const scene = buildScene(doc, {
      x1: (0 - cl.margin) / s,
      y1: (pageTop - cl.margin) / s,
      x2: (cl.pageW - cl.margin) / s,
      y2: (pageTop + cl.baseH - cl.margin) / s,
    });
    const rasters = await prepareImages(scene, imgs, 3);
    pdf.saveGraphicsState();
    pdf.rect(0, 0, pageWpt, pageHpt, 'n');
    pdf.clip();
    pdf.discardPath();
    drawSceneToPdf(pdf, scene, { tx: cl.margin, ty: cl.margin - pageTop, scale: s }, rasters);
    pdf.restoreGraphicsState();
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
