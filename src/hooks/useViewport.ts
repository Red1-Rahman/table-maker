import { type RefObject, useCallback, useEffect, useLayoutEffect, useState } from 'react';

export interface VisibleRegion {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Tracks which part of the table (table-local px) is inside the scroll container,
 * for DOM virtualisation. Falls back to "everything visible" when layout is unavailable (e.g. jsdom).
 */
export function useViewport(
  scrollRef: RefObject<HTMLElement | null>,
  pageRef: RefObject<HTMLElement | null>,
  params: { zoom: number; margin: number; tableScale: number; tableW: number; tableH: number },
): VisibleRegion {
  const { zoom, margin, tableScale, tableW, tableH } = params;
  const full: VisibleRegion = { x1: 0, y1: 0, x2: tableW, y2: tableH };
  const [region, setRegion] = useState<VisibleRegion>(full);

  const measure = useCallback(() => {
    const sc = scrollRef.current;
    const pg = pageRef.current;
    if (!sc || !pg) return;
    const cr = sc.getBoundingClientRect();
    const pr = pg.getBoundingClientRect();
    if (cr.width === 0 || cr.height === 0) {
      setRegion((prev) => (prev.x2 === tableW && prev.y2 === tableH && prev.x1 === 0 && prev.y1 === 0 ? prev : { x1: 0, y1: 0, x2: tableW, y2: tableH }));
      return;
    }
    const s = zoom * tableScale;
    const px = (v: number) => (v - pr.left - margin * zoom) / s;
    const py = (v: number) => (v - pr.top - margin * zoom) / s;
    const next = { x1: px(cr.left), y1: py(cr.top), x2: px(cr.right), y2: py(cr.bottom) };
    setRegion((prev) =>
      Math.abs(prev.x1 - next.x1) < 1 && Math.abs(prev.y1 - next.y1) < 1 && Math.abs(prev.x2 - next.x2) < 1 && Math.abs(prev.y2 - next.y2) < 1 ? prev : next,
    );
  }, [scrollRef, pageRef, zoom, margin, tableScale, tableW, tableH]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onScroll);
      ro.observe(sc);
    }
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [scrollRef, measure]);

  return region;
}
