import { useEffect, useState } from 'react';
import { useStore } from '@/store/tableStore';
import { computeCanvasLayout } from '@/core/engine/canvasRatio';
import { computeLayout } from '@/core/engine/layout';

/** Low-resolution preview of exactly what PNG/PDF export will render. */
export function ExportOverlay() {
  const doc = useStore((s) => s.doc);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { renderRegionToCanvas } = await import('@/core/export/canvasPainter');
        const tl = computeLayout(doc);
        const cl = computeCanvasLayout(doc, tl.width, tl.height);
        const pr = Math.min(1, 520 / Math.max(cl.pageW, cl.baseH));
        const canvas = await renderRegionToCanvas(doc, { x: 0, y: 0, w: cl.pageW, h: Math.min(cl.pageH, cl.baseH * 2) }, pr);
        if (alive) setUrl(canvas.toDataURL('image/png'));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [doc]);
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded border border-rule bg-desk p-3" data-testid="export-preview">
      {url ? <img src={url} alt="Export preview" className="max-h-[300px] max-w-full shadow-md" /> : <span className="text-[12px] text-ink-soft">{failed ? 'Preview unavailable' : 'Rendering preview…'}</span>}
    </div>
  );
}
