import { numericValue } from '@/core/engine/evaluate';
import { useAspectRatio } from '@/hooks/useAspectRatio';
import { useStore } from '@/store/tableStore';
import { selectionToRange } from '@/store/slices/gridSlice';
import { ratioLabel } from '@/core/engine/canvasRatio';
import { useMemo } from 'react';

export function StatusBar() {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selection);
  const layout = useAspectRatio();
  const stats = useMemo(() => {
    const rg = selectionToRange(doc, sel);
    if ((rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1) > 50_000) return null;
    let count = 0;
    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let r = rg.r1; r <= rg.r2; r++)
      for (let c = rg.c1; c <= rg.c2; c++) {
        const v = numericValue(doc, r, c);
        if (v !== null) {
          count++;
          sum += v;
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    return count > 0 ? { count, sum, avg: sum / count, min, max } : null;
  }, [doc, sel]);
  const f = (n: number) => String(Number(n.toPrecision(8)));
  return (
    <footer className="flex h-7 items-center justify-between border-t border-rule bg-white px-3 text-[11px] text-ink-soft">
      <span data-testid="stats">
        {stats ? `Sum ${f(stats.sum)} · Avg ${f(stats.avg)} · Min ${f(stats.min)} · Max ${f(stats.max)} · Count ${stats.count}` : 'Select numeric cells to see Sum / Average'}
      </span>
      <span className="font-mono">
        {doc.rows.length} × {doc.columns.length} cells · {ratioLabel(doc.aspectRatio)} · table {Math.round(layout.tableW)} × {Math.round(layout.tableH)} px
        {layout.overflow && layout.lockMode === 'growth' ? ' · overflow' : ''}
      </span>
    </footer>
  );
}
