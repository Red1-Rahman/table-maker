import type { ImageFitMode } from '@/types/schema';

export interface ImageRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Destination rectangle (relative to the box) for an image inside a w×h box. May exceed the box; callers clip. */
export function computeImageRect(fit: ImageFitMode, w: number, h: number, iw: number, ih: number): ImageRect {
  const sw = iw > 0 ? iw : 1;
  const sh = ih > 0 ? ih : 1;
  switch (fit) {
    case 'stretch':
      return { dx: 0, dy: 0, dw: w, dh: h };
    case 'contain': {
      const s = Math.min(w / sw, h / sh);
      return { dw: sw * s, dh: sh * s, dx: (w - sw * s) / 2, dy: (h - sh * s) / 2 };
    }
    case 'cover': {
      const s = Math.max(w / sw, h / sh);
      return { dw: sw * s, dh: sh * s, dx: (w - sw * s) / 2, dy: (h - sh * s) / 2 };
    }
    case 'original':
      return { dx: 0, dy: 0, dw: sw, dh: sh };
    case 'center':
      return { dx: (w - sw) / 2, dy: (h - sh) / 2, dw: sw, dh: sh };
  }
}
