import { computeCanvasLayout } from '@/core/engine/canvasRatio';
import { useStore } from '@/store/tableStore';
import { useMemo } from 'react';
import { useTableLayout } from './useTableStore';

/** Canvas auto-scaling / ratio-lock observer: page size, content scale, overflow. */
export function useAspectRatio() {
  const doc = useStore((s) => s.doc);
  const layout = useTableLayout();
  return useMemo(() => computeCanvasLayout(doc, layout.width, layout.height), [doc, layout]);
}
