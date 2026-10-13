import { computeCanvasLayout } from '@/core/engine/canvasRatio';
import { computeLayout } from '@/core/engine/layout';
import { useStore } from '@/store/tableStore';
import { useMemo } from 'react';

export const useTableStore = useStore;

/** Computed table pixel layout for the current document. */
export function useTableLayout() {
  const doc = useStore((s) => s.doc);
  return useMemo(() => computeLayout(doc), [doc]);
}
export { computeCanvasLayout };
