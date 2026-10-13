/**
 * HTML5 Canvas painter (PNG export + raster PDF fallback).
 * Renders a page region from the shared scene so output matches the on-screen grid.
 */
import { computeCanvasLayout } from '@/core/engine/canvasRatio';
import { fontCss } from '@/core/engine/fonts';
import { computeImageRect } from '@/core/engine/imageFit';
import { computeLayout } from '@/core/engine/layout';
import type { ResolvedStyle } from '@/core/engine/resolve';
import { type CellBox, type Scene, buildScene } from '@/core/engine/scene';
import { LINE_HEIGHT, layoutLines } from '@/core/engine/textLayout';
import type { BorderSpec, TableSchema } from '@/types/schema';

export interface PageRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ImageMap = Map<string, HTMLImageElement>;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

export async function loadImages(doc: TableSchema): Promise<ImageMap> {
  const map: ImageMap = new Map();
  const srcs = new Set<string>();
  for (const cell of Object.values(doc.cells)) if (cell.imageConfig?.src) srcs.add(cell.imageConfig.src);
  await Promise.all(
    [...srcs].map(async (src) => {
      try {
        map.set(src, await loadImage(src));
      } catch {
        /* broken image: skipped */
      }
    }),
  );
  return map;
}

export const fontString = (s: Pick<ResolvedStyle, 'bold' | 'italic' | 'fontFamily' | 'fontSize'>) =>
  `${s.italic ? 'italic ' : ''}${s.bold ? '700' : '400'} ${s.fontSize}px ${fontCss(s.fontFamily)}`;

export function dashFor(spec: BorderSpec): number[] {
  if (spec.style === 'dashed') return [spec.width * 4, spec.width * 3];
  if (spec.style === 'dotted') return [spec.width, spec.width * 2];
  return [];
}

function imageSize(box: CellBox, img?: HTMLImageElement) {
  const cfg = box.cell.image;
  const iw = img?.naturalWidth || cfg?.naturalWidth || 300;
  const ih = img?.naturalHeight || cfg?.naturalHeight || 150;
  return { iw, ih };
}

export function drawBox(ctx: CanvasRenderingContext2D, box: CellBox, imgs: ImageMap) {
  const { cell } = box;
  const st = cell.style;
  ctx.fillStyle = st.bg;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  if (cell.bar) {
    ctx.fillStyle = cell.bar.color;
    ctx.fillRect(box.x + 2, box.y + 3, Math.max(0, (box.w - 4) * cell.bar.frac), Math.max(0, box.h - 6));
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  if (cell.kind === 'image' && cell.image) {
    const img = imgs.get(cell.image.src);
    if (img) {
      const pad = 2;
      const iw = box.w - pad * 2;
      const ih = box.h - pad * 2;
      const { iw: nw, ih: nh } = imageSize(box, img);
      const rc = computeImageRect(cell.image.fitMode, iw, ih, nw, nh);
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x + pad, box.y + pad, iw, ih);
      ctx.clip();
      ctx.drawImage(img, box.x + pad + rc.dx, box.y + pad + rc.dy, rc.dw, rc.dh);
      ctx.restore();
    }
  } else if (cell.kind === 'checkbox') {
    const s = Math.max(8, Math.min(18, Math.min(box.w, box.h) - 10));
    const x = box.x + (box.w - s) / 2;
    const y = box.y + (box.h - s) / 2;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, s, s);
    if (cell.checked) {
      ctx.beginPath();
      ctx.moveTo(x + s * 0.2, y + s * 0.55);
      ctx.lineTo(x + s * 0.42, y + s * 0.78);
      ctx.lineTo(x + s * 0.82, y + s * 0.25);
      ctx.stroke();
    }
  } else if (cell.text !== '') {
    drawText(ctx, box, st, cell.text);
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, box: CellBox, st: ResolvedStyle, text: string) {
  ctx.font = fontString(st);
  ctx.fillStyle = st.color;
  ctx.textBaseline = 'top';
  const pad = st.padding;
  const innerW = box.w - pad * 2;
  const lines = layoutLines(text, st, innerW, (s) => ctx.measureText(s).width);
  const lh = st.fontSize * LINE_HEIGHT;
  const blockH = lines.length * lh;
  let y =
    st.valign === 'top' ? box.y + pad : st.valign === 'bottom' ? box.y + box.h - pad - blockH : box.y + (box.h - blockH) / 2;
  if (blockH > box.h - pad * 2 && st.valign !== 'top') y = box.y + pad;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    const x = st.align === 'center' ? box.x + (box.w - w) / 2 : st.align === 'right' ? box.x + box.w - pad - w : box.x + pad;
    const ty = y + (lh - st.fontSize) / 2;
    ctx.fillText(line, x, ty);
    if (st.underline || st.strike) {
      ctx.strokeStyle = st.color;
      ctx.lineWidth = Math.max(1, st.fontSize / 14);
      ctx.beginPath();
      if (st.underline) {
        ctx.moveTo(x, ty + st.fontSize * 1.05);
        ctx.lineTo(x + w, ty + st.fontSize * 1.05);
      }
      if (st.strike) {
        ctx.moveTo(x, ty + st.fontSize * 0.55);
        ctx.lineTo(x + w, ty + st.fontSize * 0.55);
      }
      ctx.stroke();
    }
    y += lh;
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, imgs: ImageMap) {
  for (const box of scene.boxes) drawBox(ctx, box, imgs);
  ctx.lineCap = 'butt';
  for (const e of scene.edges) {
    ctx.strokeStyle = e.spec.color;
    ctx.lineWidth = e.spec.width;
    ctx.setLineDash(dashFor(e.spec));
    ctx.beginPath();
    ctx.moveTo(e.x1, e.y1);
    ctx.lineTo(e.x2, e.y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Render a rectangular region of the page (page pixel coordinates) to a canvas. */
export async function renderRegionToCanvas(
  doc: TableSchema,
  region: PageRegion,
  pixelRatio: number,
  imgs?: ImageMap,
): Promise<HTMLCanvasElement> {
  const images = imgs ?? (await loadImages(doc));
  const tl = computeLayout(doc);
  const cl = computeCanvasLayout(doc, tl.width, tl.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.w * pixelRatio));
  canvas.height = Math.max(1, Math.round(region.h * pixelRatio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  ctx.scale(pixelRatio, pixelRatio);
  ctx.translate(-region.x, -region.y);
  ctx.fillStyle = doc.canvas.bg;
  ctx.fillRect(region.x, region.y, region.w, region.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.w, region.h);
  ctx.clip();
  ctx.translate(cl.margin, cl.margin);
  ctx.scale(cl.tableScale, cl.tableScale);
  const s = cl.tableScale;
  const scene = buildScene(doc, {
    x1: (region.x - cl.margin) / s,
    y1: (region.y - cl.margin) / s,
    x2: (region.x + region.w - cl.margin) / s,
    y2: (region.y + region.h - cl.margin) / s,
  });
  drawScene(ctx, scene, images);
  ctx.restore();
  return canvas;
}

export function canvasToBytes(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('Canvas export failed'));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      type,
      quality,
    );
  });
}

/** Cap supersampling so huge pages do not exceed browser canvas limits. */
export function safePixelRatio(requested: number, w: number, h: number): number {
  const byDim = 8192 / Math.max(w, h);
  const byArea = Math.sqrt(48_000_000 / (w * h));
  return Math.max(1, Math.min(requested, byDim, byArea));
}
