import { colToLetters } from '@/core/engine/address';
import type { Layout } from '@/core/engine/layout';
import { useStore } from '@/store/tableStore';
import { useState } from 'react';

export const HEADER_W = 40;
export const HEADER_H = 24;

export interface Resizing {
  axis: 'col' | 'row';
  index: number;
  size: number;
}

interface Props {
  layout: Layout;
  rows: [number, number]; // visible row index window
  cols: [number, number];
  scale: number;
  onResizing: (r: Resizing | null) => void;
}

const base = 'absolute flex items-center justify-center bg-chrome text-[11px] font-medium text-ink-soft select-none border-rule';

/** Column letters + row numbers: click to select, drag to reorder, drag edges to resize, right-click for menu. */
export function GridHeader({ layout, rows, cols, scale, onResizing }: Props) {
  const sel = useStore((s) => s.selection);
  const nCols = useStore((s) => s.doc.columns.length);
  const nRows = useStore((s) => s.doc.rows.length);
  const snap = useStore((s) => s.snapToGrid);
  const snapSize = useStore((s) => s.snapSize);
  const [over, setOver] = useState<string | null>(null);
  const r1 = Math.min(sel.anchor.r, sel.focus.r);
  const r2 = Math.max(sel.anchor.r, sel.focus.r);
  const c1 = Math.min(sel.anchor.c, sel.focus.c);
  const c2 = Math.max(sel.anchor.c, sel.focus.c);
  const wholeRows = c1 === 0 && c2 === nCols - 1;
  const wholeCols = r1 === 0 && r2 === nRows - 1;

  const startResize = (e: React.PointerEvent, axis: 'col' | 'row', index: number, size: number) => {
    e.preventDefault();
    e.stopPropagation();
    const start = axis === 'col' ? e.clientX : e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let latest = size;
    const move = (ev: PointerEvent) => {
      const delta = ((axis === 'col' ? ev.clientX : ev.clientY) - start) / scale;
      latest = Math.max(axis === 'col' ? 24 : 16, size + delta);
      if (snap) latest = Math.round(latest / snapSize) * snapSize;
      onResizing({ axis, index, size: latest });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      onResizing(null);
      const st = useStore.getState();
      if (Math.round(latest) !== Math.round(size)) (axis === 'col' ? st.resizeCol : st.resizeRow)(index, latest);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const colEls = [];
  for (let c = cols[0]; c <= cols[1]; c++) {
    const x = layout.colX[c];
    const w = layout.colX[c + 1] - x;
    const selected = wholeCols ? c >= c1 && c <= c2 : c >= c1 && c <= c2;
    colEls.push(
      <div
        key={`c${c}`}
        draggable
        data-col-header={c}
        className={`${base} border-b border-r ${selected ? '!bg-accent-soft !text-accent' : ''} ${over === `c${c}` ? '!bg-accent/30' : ''}`}
        style={{ left: x, top: -HEADER_H, width: w, height: HEADER_H, cursor: 'pointer' }}
        onClick={(e) => useStore.getState().selectCol(c, e.shiftKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          const st = useStore.getState();
          if (!(wholeCols && c >= c1 && c <= c2)) st.selectCol(c);
          st.setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'col', r: 0, c });
        }}
        onDragStart={(e) => e.dataTransfer.setData('application/x-tm-col', String(c))}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-tm-col')) {
            e.preventDefault();
            setOver(`c${c}`);
          }
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          setOver(null);
          const from = Number(e.dataTransfer.getData('application/x-tm-col'));
          if (!Number.isNaN(from)) useStore.getState().moveLine('col', from, c);
        }}
      >
        {colToLetters(c)}
        <span
          onPointerDown={(e) => startResize(e, 'col', c, w)}
          onDoubleClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', right: -4, top: 0, width: 8, height: '100%', cursor: 'col-resize', zIndex: 3 }}
        />
      </div>,
    );
  }
  const rowEls = [];
  for (let r = rows[0]; r <= rows[1]; r++) {
    if (layout.hidden.has(r)) continue;
    const y = layout.rowY[r];
    const h = layout.rowY[r + 1] - y;
    const selected = r >= r1 && r <= r2;
    rowEls.push(
      <div
        key={`r${r}`}
        draggable
        data-row-header={r}
        className={`${base} border-b border-r ${selected ? '!bg-accent-soft !text-accent' : ''} ${over === `r${r}` ? '!bg-accent/30' : ''}`}
        style={{ left: -HEADER_W, top: y, width: HEADER_W, height: h, cursor: 'pointer' }}
        onClick={(e) => useStore.getState().selectRow(r, e.shiftKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          const st = useStore.getState();
          if (!(wholeRows && r >= r1 && r <= r2)) st.selectRow(r);
          st.setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'row', r, c: 0 });
        }}
        onDragStart={(e) => e.dataTransfer.setData('application/x-tm-row', String(r))}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-tm-row')) {
            e.preventDefault();
            setOver(`r${r}`);
          }
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          setOver(null);
          const from = Number(e.dataTransfer.getData('application/x-tm-row'));
          if (!Number.isNaN(from)) useStore.getState().moveLine('row', from, r);
        }}
      >
        {r + 1}
        <span
          onPointerDown={(e) => startResize(e, 'row', r, h)}
          style={{ position: 'absolute', bottom: -4, left: 0, height: 8, width: '100%', cursor: 'row-resize', zIndex: 3 }}
        />
      </div>,
    );
  }
  return (
    <>
      <div
        className={`${base} border-b border-r`}
        style={{ left: -HEADER_W, top: -HEADER_H, width: HEADER_W, height: HEADER_H, cursor: 'pointer' }}
        onClick={() => useStore.getState().selectAll()}
        title="Select all"
      >
        ◢
      </div>
      {colEls}
      {rowEls}
    </>
  );
}
