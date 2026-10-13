import { computeLayout, indexAt } from '@/core/engine/layout';
import { resolveCell } from '@/core/engine/resolve';
import { type CellBox, buildScene, mergeIndex } from '@/core/engine/scene';
import type { VisibleRegion } from '@/hooks/useViewport';
import { selectionToRange } from '@/store/slices/gridSlice';
import { useStore } from '@/store/tableStore';
import { cellKey } from '@/types/schema';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CellEditor } from './CellEditor';
import { CellRenderer } from './CellRenderer';
import { GridHeader, HEADER_H, HEADER_W, type Resizing } from './GridHeader';

interface Props {
  visible: VisibleRegion;
  scale: number; // zoom * tableScale
}

const OVERSCAN = 3;

const SelectionOverlay = memo(function SelectionOverlay() {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selection);
  const editing = useStore((s) => s.editing);
  const layout = useMemo(() => computeLayout(doc), [doc]);
  const rg = selectionToRange(doc, sel);
  const x = layout.colX[rg.c1];
  const y = layout.rowY[rg.r1];
  const w = layout.colX[rg.c2 + 1] - x;
  const h = layout.rowY[rg.r2 + 1] - y;
  const multi = rg.r1 !== rg.r2 || rg.c1 !== rg.c2;
  const fo = mergeIndex(doc).get(cellKey(sel.focus.r, sel.focus.c));
  const ar = fo ? fo.r1 : sel.focus.r;
  const ac = fo ? fo.c1 : sel.focus.c;
  const ax = layout.colX[ac];
  const ay = layout.rowY[ar];
  const aw = layout.colX[(fo ? fo.c2 : ac) + 1] - ax;
  const ah = layout.rowY[(fo ? fo.r2 : ar) + 1] - ay;
  return (
    <>
      <div
        data-testid="selection"
        style={{
          position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', pointerEvents: 'none', zIndex: 4,
          border: '2px solid #2f5bea', background: multi ? 'rgba(47,91,234,.10)' : 'transparent',
        }}
      />
      {multi && !editing && (
        <div style={{ position: 'absolute', left: ax, top: ay, width: aw, height: ah, boxSizing: 'border-box', pointerEvents: 'none', zIndex: 4, outline: '1.5px solid #2f5bea', background: 'rgba(255,255,255,.55)' }} />
      )}
    </>
  );
});

/** Virtualised DOM grid. Renders only visible cells + frozen panes, edges via a single SVG. */
export function TableGrid({ visible, scale }: Props) {
  const doc = useStore((s) => s.doc);
  const editing = useStore((s) => s.editing);
  const showHeaders = useStore((s) => s.showHeaders);
  const layout = useMemo(() => computeLayout(doc), [doc]);
  const [resizing, setResizing] = useState<Resizing | null>(null);
  const dragging = useRef(false);
  const lastCell = useRef('');

  const nRows = doc.rows.length;
  const nCols = doc.columns.length;
  const r0 = Math.max(0, indexAt(layout.rowY, visible.y1) - OVERSCAN);
  const r1 = Math.min(nRows - 1, indexAt(layout.rowY, visible.y2) + OVERSCAN);
  const c0 = Math.max(0, indexAt(layout.colX, visible.x1) - OVERSCAN);
  const c1 = Math.min(nCols - 1, indexAt(layout.colX, visible.x2) + OVERSCAN);
  const { rows: fRows, cols: fCols } = doc.frozen;

  const boxes = useMemo(() => {
    const eps = 0.01;
    const region = { x1: layout.colX[c0], y1: layout.rowY[r0], x2: layout.colX[c1 + 1] - eps, y2: layout.rowY[r1 + 1] - eps };
    const main = buildScene(doc, region, 0);
    const out = new Map<string, CellBox>();
    for (const b of main.boxes) out.set(`${b.r}:${b.c}`, b);
    if (fRows > 0 || fCols > 0) {
      const strips = [];
      if (fRows > 0) strips.push({ x1: layout.colX[c0], y1: 0, x2: layout.colX[c1 + 1] - eps, y2: layout.rowY[fRows] - eps });
      if (fCols > 0) strips.push({ x1: 0, y1: layout.rowY[r0], x2: layout.colX[fCols] - eps, y2: layout.rowY[r1 + 1] - eps });
      if (fRows > 0 && fCols > 0) strips.push({ x1: 0, y1: 0, x2: layout.colX[fCols] - eps, y2: layout.rowY[fRows] - eps });
      for (const s of strips) for (const b of buildScene(doc, s, 0).boxes) if (!out.has(`${b.r}:${b.c}`)) out.set(`${b.r}:${b.c}`, b);
    }
    return { list: [...out.values()], edges: main.edges };
  }, [doc, layout, c0, c1, r0, r1, fRows, fCols]);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const cellFrom = (target: EventTarget | null): { r: number; c: number } | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-cell]') as HTMLElement | null;
    if (!el) return null;
    return { r: Number(el.dataset.r), c: Number(el.dataset.c) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const st = useStore.getState();
    st.setCtxMenu(null);
    const hit = cellFrom(e.target);
    if (!hit || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-checkbox]')) {
      st.select(hit);
      st.toggleCheckbox(hit.r, hit.c);
      return;
    }
    if (e.shiftKey) st.select(st.selection.anchor, hit);
    else st.select(hit);
    dragging.current = true;
    lastCell.current = `${hit.r}:${hit.c}`;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !(e.buttons & 1)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const hit = cellFrom(el);
    if (!hit) return;
    const key = `${hit.r}:${hit.c}`;
    if (key === lastCell.current) return;
    lastCell.current = key;
    const st = useStore.getState();
    st.select(st.selection.anchor, hit);
  };

  const dx = fCols > 0 ? Math.max(0, visible.x1) : 0;
  const dy = fRows > 0 ? Math.max(0, visible.y1) : 0;

  // editor geometry
  let editor: React.ReactNode = null;
  if (editing) {
    const m = mergeIndex(doc).get(cellKey(editing.r, editing.c));
    const rr = m ? m.r2 : editing.r;
    const cc = m ? m.c2 : editing.c;
    const x = layout.colX[editing.c];
    const y = layout.rowY[editing.r];
    editor = (
      <CellEditor
        key={`${editing.r}:${editing.c}:${useStore.getState().revision}`}
        r={editing.r}
        c={editing.c}
        initial={editing.initial}
        x={x}
        y={y}
        w={layout.colX[cc + 1] - x}
        h={layout.rowY[rr + 1] - y}
        style={resolveCell(doc, editing.r, editing.c).style}
      />
    );
  }

  return (
    <div
      data-testid="grid"
      style={{ position: 'relative', width: layout.width, height: layout.height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onDoubleClick={(e) => {
        const hit = cellFrom(e.target);
        if (hit) useStore.getState().startEdit(hit.r, hit.c);
      }}
      onContextMenu={(e) => {
        const hit = cellFrom(e.target);
        if (!hit) return;
        e.preventDefault();
        const st = useStore.getState();
        const rg = selectionToRange(st.doc, st.selection);
        if (!(hit.r >= rg.r1 && hit.r <= rg.r2 && hit.c >= rg.c1 && hit.c <= rg.c2)) st.select(hit);
        st.setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'cell', r: hit.r, c: hit.c });
      }}
    >
      {boxes.list.map((b) => (
        <CellRenderer
          key={`${b.r}:${b.c}`}
          box={b}
          dx={b.c < fCols ? dx : 0}
          dy={b.r < fRows ? dy : 0}
          isFrozen={b.r < fRows || b.c < fCols}
          frozenEdgeRight={fCols > 0 && b.c + b.colSpan === fCols}
          frozenEdgeBottom={fRows > 0 && b.r + b.rowSpan === fRows}
        />
      ))}
      <svg width={layout.width} height={layout.height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 1 }} aria-hidden>
        {boxes.edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.spec.color}
            strokeWidth={e.spec.width}
            strokeDasharray={e.spec.style === 'dashed' ? `${e.spec.width * 4} ${e.spec.width * 3}` : e.spec.style === 'dotted' ? `${e.spec.width} ${e.spec.width * 2}` : undefined}
          />
        ))}
      </svg>
      <SelectionOverlay />
      {editor}
      {showHeaders && <GridHeader layout={layout} rows={[r0, r1]} cols={[c0, c1]} scale={scale} onResizing={setResizing} />}
      {resizing && (
        <div
          style={{
            position: 'absolute', zIndex: 8, pointerEvents: 'none', background: '#d6336c',
            ...(resizing.axis === 'col'
              ? { left: layout.colX[resizing.index] + resizing.size - 0.5, top: -HEADER_H, width: 1, height: layout.height + HEADER_H }
              : { top: layout.rowY[resizing.index] + resizing.size - 0.5, left: -HEADER_W, height: 1, width: layout.width + HEADER_W }),
          }}
        >
          <span style={{ position: 'absolute', left: 4, top: 2, fontSize: 11, color: '#d6336c', whiteSpace: 'nowrap' }}>{Math.round(resizing.size)}px</span>
        </div>
      )}
    </div>
  );
}
