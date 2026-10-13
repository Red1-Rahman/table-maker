import type { ImageConfig } from '@/types/schema';

export const MAX_IMAGE_DIM = 1600;
export const MAX_SVG_BYTES = 600_000;
export const ACCEPTED_IMAGES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif'];

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the image.'));
    img.src = src;
  });
}

export const isImageFile = (f: File) => ACCEPTED_IMAGES.includes(f.type) || /\.(png|jpe?g|svg|webp|gif)$/i.test(f.name);

/** Decodes, downsizes and recompresses (WebP → PNG fallback) an image so it is cheap to store. */
export async function ingestImageFile(file: File): Promise<ImageConfig> {
  const alt = file.name.replace(/\.[^.]+$/, '');
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    if (file.size > MAX_SVG_BYTES) throw new Error('SVG is too large (max 600 KB).');
    const src = await readAsDataUrl(new Blob([await file.arrayBuffer()], { type: 'image/svg+xml' }));
    const img = await loadImg(src);
    return { src, fitMode: 'contain', altText: alt, naturalWidth: img.naturalWidth || 300, naturalHeight: img.naturalHeight || 150 };
  }
  const original = await readAsDataUrl(file);
  const img = await loadImg(original);
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { src: original, fitMode: 'contain', altText: alt, naturalWidth: w, naturalHeight: h };
  ctx.drawImage(img, 0, 0, w, h);
  let out = canvas.toDataURL('image/webp', 0.85);
  if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
  if (out.length >= original.length && scale === 1 && /^data:image\/(png|jpeg|webp)/.test(original)) out = original;
  return { src: out, fitMode: 'contain', altText: alt, naturalWidth: w, naturalHeight: h };
}
