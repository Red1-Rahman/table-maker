import { ratioLabel } from '@/core/engine/canvasRatio';
import { useAspectRatio } from '@/hooks/useAspectRatio';
import { useViewport } from '@/hooks/useViewport';
import { fitZoom } from '@/core/engine/canvasRatio';
import { useStore } from '@/store/tableStore';
import { importFile } from '@/core/export/importers';
import { ingestImageFile, isImageFile } from '@/utils/image';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { TableGrid } from '../grid/TableGrid';
import { AspectRatioGuide } from './AspectRatioGuide';

const PAD = 84;

/** Aspect-ratio wrapper with zoom (10–500 %), pan, fit-to-screen, guides and drag-and-drop. */
export function CanvasContainer() {
  const doc = useStore((s) => s.doc);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const fitRequest = useStore((s) => s.fitRequest);
  const showMargins = useStore((s) => s.showMargins);
  const showBleed = useStore((s) => s.showBleed);
  const showPageBreaks = useStore((s) => s.showPageBreaks);
  const layout = useAspectRatio();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);

  const visible = useViewport(scrollRef, pageRef, {
    zoom,
    margin: layout.margin,
    tableScale: layout.tableScale,
    tableW: layout.tableW,
    tableH: layout.tableH,
  });

  // fit on first mount and on request
  const fitToScreen = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc || sc.clientWidth === 0) return;
    setZoom(fitZoom(layout.pageW, layout.baseH, sc.clientWidth, sc.clientHeight, PAD * 1.6));
  }, [layout.pageW, layout.baseH, setZoom]);
  useEffect(() => {
    fitToScreen();
  }, [fitRequest, doc.aspectRatio, doc.dimensions.customWidthPx, doc.dimensions.customHeightPx]);

  // zoom with Ctrl/Cmd + wheel, keeping the point under the cursor fixed
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const pr = pageRef.current?.getBoundingClientRect();
      const cr = sc.getBoundingClientRect();
      if (!pr) return;
      const z = useStore.getState().zoom;
      anchor.current = { px: (e.clientX - pr.left) / z, py: (e.clientY - pr.top) / z, cx: e.clientX - cr.left, cy: e.clientY - cr.top };
      useStore.getState().setZoom(z * Math.exp(-e.deltaY * 0.0015));
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, []);
  useLayoutEffect(() => {
    const a = anchor.current;
    const sc = scrollRef.current;
    const pg = pageRef.current;
    if (!a || !sc || !pg) return;
    anchor.current = null;
    const cr = sc.getBoundingClientRect();
    const pr = pg.getBoundingClientRect();
    sc.scrollLeft += pr.left + a.px * zoom - (cr.left + a.cx);
    sc.scrollTop += pr.top + a.py * zoom - (cr.top + a.cy);
  }, [zoom]);

  // middle-mouse / space-drag panning
  const panning = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const spaceDown = useRef(false);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest?.('input,textarea,select')) spaceDown.current = true;
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const st = useStore.getState();
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const file = files[0];
    try {
      if (isImageFile(file)) {
        const cell = (e.target as HTMLElement).closest?.('[data-cell]') as HTMLElement | null;
        const f = st.selection.focus;
        const r = cell ? Number(cell.dataset.r) : f.r;
        const c = cell ? Number(cell.dataset.c) : f.c;
        st.setImage(r, c, await ingestImageFile(file));
        st.select({ r, c });
      } else {
        if (st.past.length > 0 && !window.confirm('Replace the current table with the imported file? (Export or save first if you want to keep it.)')) return;
        st.loadDocument(await importFile(file));
        st.toast(`Imported ${file.name}`, 'success');
        st.requestFit();
      }
    } catch (err) {
      st.toast(err instanceof Error ? err.message : 'Could not import that file.', 'error');
    }
  };

  const sizeW = layout.pageW * zoom;
  const sizeH = layout.pageH * zoom;
  const total = zoom * layout.tableScale;

  return (
    <div
      ref={scrollRef}
      data-testid="canvas-scroll"
      className="relative flex-1 overflow-auto bg-desk"
      onPointerDown={(e) => {
        if (e.button === 1 || (spaceDown.current && e.button === 0)) {
          e.preventDefault();
          const sc = scrollRef.current as HTMLDivElement;
          panning.current = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, st: sc.scrollTop };
          sc.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        const p = panning.current;
        const sc = scrollRef.current;
        if (!p || !sc) return;
        sc.scrollLeft = p.sl - (e.clientX - p.x);
        sc.scrollTop = p.st - (e.clientY - p.y);
      }}
      onPointerUp={() => {
        panning.current = null;
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div style={{ display: 'flex', minWidth: '100%', minHeight: '100%', width: 'max-content', boxSizing: 'border-box', padding: PAD }}>
        <div style={{ position: 'relative', width: sizeW, height: sizeH, margin: 'auto', flex: 'none' }}>
          <div className="absolute -top-7 left-0 whitespace-nowrap font-mono text-[11px] text-ink-soft" data-testid="page-label">
            {ratioLabel(doc.aspectRatio)} · {Math.round(layout.pageW)} × {Math.round(layout.baseH)} px
            {layout.pages > 1 ? ` × ${layout.pages} pages` : ''}
            {layout.tableScale < 1 ? ` · content ${Math.round(layout.tableScale * 100)}%` : ''}
            {layout.overflow && layout.lockMode === 'growth' ? ' · overflowing' : ''}
          </div>
          <div
            ref={pageRef}
            data-testid="page"
            className="page-sheet"
            style={{ position: 'absolute', left: 0, top: 0, width: layout.pageW, height: layout.pageH, transform: `scale(${zoom})`, transformOrigin: '0 0', background: doc.canvas.bg }}
          >
            <div
              style={{
                position: 'absolute',
                left: layout.margin,
                top: layout.margin,
                width: layout.tableW,
                height: layout.tableH,
                transform: `scale(${layout.tableScale})`,
                transformOrigin: '0 0',
              }}
            >
              <TableGrid visible={visible} scale={total} />
            </div>
            <AspectRatioGuide layout={layout} bleed={doc.canvas.bleed} showMargins={showMargins} showBleed={showBleed} showPageBreaks={showPageBreaks} zoom={zoom} />
          </div>
        </div>
      </div>
    </div>
  );
}
