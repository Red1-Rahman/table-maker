/**
 * Vector PDF painter on top of jsPDF. Text stays selectable, lines stay crisp.
 * Built-in PDF fonts only support Latin-1, so the exporter falls back to raster
 * rendering for other scripts (see pdfExporter.ts).
 */
import { fontInfo } from '@/core/engine/fonts';
import { computeImageRect } from '@/core/engine/imageFit';
import { hexToRgb } from '@/core/engine/resolve';
import type { CellBox, Scene } from '@/core/engine/scene';
import { LINE_HEIGHT, layoutLines } from '@/core/engine/textLayout';
import type { jsPDF } from 'jspdf';
import { type ImageMap, dashFor, loadImage } from './canvasPainter';

const K = 0.75; // px → pt

export interface PdfMap {
  /** table-local px → page-local pt */
  tx: number;
  ty: number;
  scale: number;
}

const fillRgb = (pdf: jsPDF, hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  pdf.setFillColor(r, g, b);
};
const strokeRgb = (pdf: jsPDF, hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  pdf.setDrawColor(r, g, b);
};

function fontStyle(bold: boolean, italic: boolean): 'normal' | 'bold' | 'italic' | 'bolditalic' {
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
}

/** Rasterise an image cell (respecting fit mode) so SVG / WebP embed cleanly in the PDF. */
async function rasteriseImageBox(box: CellBox, imgs: ImageMap, ratio: number): Promise<string | null> {
  const cfg = box.cell.image;
  if (!cfg) return null;
  let img = imgs.get(cfg.src);
  if (!img) {
    try {
      img = await loadImage(cfg.src);
    } catch {
      return null;
    }
  }
  const pad = 2;
  const w = Math.max(1, box.w - pad * 2);
  const h = Math.max(1, box.h - pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(ratio, ratio);
  const rc = computeImageRect(cfg.fitMode, w, h, img.naturalWidth || cfg.naturalWidth || 300, img.naturalHeight || cfg.naturalHeight || 150);
  ctx.drawImage(img, rc.dx, rc.dy, rc.dw, rc.dh);
  return canvas.toDataURL('image/png');
}

export async function prepareImages(scene: Scene, imgs: ImageMap, ratio: number): Promise<Map<CellBox, string>> {
  const out = new Map<CellBox, string>();
  for (const box of scene.boxes) {
    if (box.cell.kind !== 'image') continue;
    const url = await rasteriseImageBox(box, imgs, ratio);
    if (url) out.set(box, url);
  }
  return out;
}

export function drawSceneToPdf(pdf: jsPDF, scene: Scene, map: PdfMap, rasters: Map<CellBox, string>) {
  const X = (x: number) => (map.tx + x * map.scale) * K;
  const Y = (y: number) => (map.ty + y * map.scale) * K;
  const S = (v: number) => v * map.scale * K;

  for (const box of scene.boxes) {
    const st = box.cell.style;
    const x = X(box.x);
    const y = Y(box.y);
    const w = S(box.w);
    const h = S(box.h);
    fillRgb(pdf, st.bg);
    pdf.rect(x, y, w, h, 'F');
    if (box.cell.bar) {
      fillRgb(pdf, box.cell.bar.color);
      pdf.rect(x + S(2), y + S(3), Math.max(0, (w - S(4)) * box.cell.bar.frac), Math.max(0, h - S(6)), 'F');
    }
    pdf.saveGraphicsState();
    pdf.rect(x, y, w, h, 'n');
    pdf.clip();
    pdf.discardPath();
    if (box.cell.kind === 'image') {
      const url = rasters.get(box);
      if (url) pdf.addImage(url, 'PNG', x + S(2), y + S(2), w - S(4), h - S(4));
    } else if (box.cell.kind === 'checkbox') {
      const s = Math.max(8, Math.min(18, Math.min(box.w, box.h) - 10)) * map.scale * K;
      const cx = x + (w - s) / 2;
      const cy = y + (h - s) / 2;
      strokeRgb(pdf, st.color);
      pdf.setLineWidth(1.1 * map.scale);
      pdf.setLineDashPattern([], 0);
      pdf.rect(cx, cy, s, s, 'S');
      if (box.cell.checked) {
        pdf.line(cx + s * 0.2, cy + s * 0.55, cx + s * 0.42, cy + s * 0.78);
        pdf.line(cx + s * 0.42, cy + s * 0.78, cx + s * 0.82, cy + s * 0.25);
      }
    } else if (box.cell.text !== '') {
      drawPdfText(pdf, box, x, y, w, h, map.scale);
    }
    pdf.restoreGraphicsState();
  }

  for (const e of scene.edges) {
    strokeRgb(pdf, e.spec.color);
    pdf.setLineWidth(S(e.spec.width));
    const dash = dashFor(e.spec).map((d) => S(d));
    pdf.setLineDashPattern(dash, 0);
    pdf.line(X(e.x1), Y(e.y1), X(e.x2), Y(e.y2));
  }
  pdf.setLineDashPattern([], 0);
}

function drawPdfText(pdf: jsPDF, box: CellBox, x: number, y: number, w: number, h: number, scale: number) {
  const st = box.cell.style;
  pdf.setFont(fontInfo(st.fontFamily).pdf, fontStyle(st.bold, st.italic));
  const sizePt = st.fontSize * K * scale;
  pdf.setFontSize(sizePt);
  const [r, g, b] = hexToRgb(st.color);
  pdf.setTextColor(r, g, b);
  const pad = st.padding * K * scale;
  const measure = (s: string) => pdf.getTextWidth(s);
  const lines = layoutLines(box.cell.text, st, w - pad * 2, measure);
  const lh = sizePt * LINE_HEIGHT;
  const blockH = lines.length * lh;
  let ty = st.valign === 'top' ? y + pad : st.valign === 'bottom' ? y + h - pad - blockH : y + (h - blockH) / 2;
  if (blockH > h - pad * 2 && st.valign !== 'top') ty = y + pad;
  for (const line of lines) {
    const tw = measure(line);
    const tx = st.align === 'center' ? x + (w - tw) / 2 : st.align === 'right' ? x + w - pad - tw : x + pad;
    const top = ty + (lh - sizePt) / 2;
    pdf.text(line, tx, top, { baseline: 'top' });
    if (st.underline || st.strike) {
      strokeRgb(pdf, st.color);
      pdf.setLineWidth(Math.max(0.4, sizePt / 14));
      pdf.setLineDashPattern([], 0);
      if (st.underline) pdf.line(tx, top + sizePt * 1.05, tx + tw, top + sizePt * 1.05);
      if (st.strike) pdf.line(tx, top + sizePt * 0.55, tx + tw, top + sizePt * 0.55);
    }
    ty += lh;
  }
}
