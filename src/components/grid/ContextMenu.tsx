import { useStore } from '@/store/tableStore';
import { useEffect, useRef } from 'react';

interface Item {
  label: string;
  run?: () => void;
  disabled?: boolean;
  sep?: boolean;
  danger?: boolean;
}

/** Right-click menu for cells and row/column headers. */
export function ContextMenu() {
  const menu = useStore((s) => s.ctxMenu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      useStore.getState().setCtxMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  if (!menu) return null;
  const st = useStore.getState();
  const rg = st.selectionRange();
  const nR = rg.r2 - rg.r1 + 1;
  const nC = rg.c2 - rg.c1 + 1;
  const hasMerge = st.doc.mergedRanges.some((m) => m.r1 <= rg.r2 && m.r2 >= rg.r1 && m.c1 <= rg.c2 && m.c2 >= rg.c1);
  const plural = (n: number, w: string) => (n > 1 ? `${n} ${w}s` : w);
  const exec = (cmd: 'copy' | 'cut' | 'paste') => {
    if (cmd === 'paste') {
      navigator.clipboard
        ?.readText()
        .then((t) => st.pasteMatrix(t.split(/\r?\n/).map((l) => l.split('\t')), t))
        .catch(() => st.toast('Use Ctrl/Cmd+V to paste (browser blocked clipboard access).'));
      return;
    }
    document.execCommand(cmd);
  };

  const items: Item[] = [];
  if (menu.kind === 'cell') {
    items.push(
      { label: 'Cut', run: () => exec('cut') },
      { label: 'Copy', run: () => exec('copy') },
      { label: 'Paste', run: () => exec('paste') },
      { sep: true, label: '' },
    );
  }
  if (menu.kind !== 'col') {
    items.push(
      { label: `Insert ${plural(nR, 'row')} above`, run: () => st.insertRows(rg.r1, nR) },
      { label: `Insert ${plural(nR, 'row')} below`, run: () => st.insertRows(rg.r2 + 1, nR) },
    );
  }
  if (menu.kind !== 'row') {
    items.push(
      { label: `Insert ${plural(nC, 'column')} left`, run: () => st.insertCols(rg.c1, nC) },
      { label: `Insert ${plural(nC, 'column')} right`, run: () => st.insertCols(rg.c2 + 1, nC) },
    );
  }
  items.push({ sep: true, label: '' });
  if (menu.kind !== 'col') items.push({ label: `Delete ${plural(nR, 'row')}`, run: () => st.deleteRows(rg.r1, nR), danger: true });
  if (menu.kind !== 'row') items.push({ label: `Delete ${plural(nC, 'column')}`, run: () => st.deleteCols(rg.c1, nC), danger: true });
  if (menu.kind === 'cell') {
    items.push(
      { sep: true, label: '' },
      { label: 'Merge cells', run: st.mergeSelection, disabled: nR * nC < 2 },
      { label: 'Unmerge cells', run: st.unmergeSelection, disabled: !hasMerge },
      { label: 'Insert image…', run: () => window.dispatchEvent(new CustomEvent('tm:pick-image')) },
      { sep: true, label: '' },
      { label: 'Clear contents', run: st.clearSelection },
      { label: 'Clear formatting', run: st.clearFormatting },
    );
  }
  const col = menu.kind === 'row' ? rg.c1 : menu.c;
  items.push(
    { sep: true, label: '' },
    { label: 'Sort column A → Z', run: () => st.sortByColumn(col, 'asc') },
    { label: 'Sort column Z → A', run: () => st.sortByColumn(col, 'desc') },
    { label: `Freeze up to ${menu.kind === 'col' ? 'this column' : 'this row'}`, run: () => (menu.kind === 'col' ? st.setFrozen(st.doc.frozen.rows, rg.c2 + 1) : st.setFrozen(rg.r2 + 1, st.doc.frozen.cols)) },
    { label: 'Unfreeze', run: () => st.setFrozen(0, 0), disabled: st.doc.frozen.rows === 0 && st.doc.frozen.cols === 0 },
  );

  const width = 220;
  const height = items.length * 30;
  const left = Math.min(menu.x, window.innerWidth - width - 8);
  const top = Math.min(menu.y, window.innerHeight - height - 8);
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[70] rounded-md border border-rule bg-white p-1 shadow-xl"
      style={{ left, top, width }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div key={`s${i}`} className="my-1 h-px bg-rule" />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={`block w-full rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-transparent ${it.danger ? 'text-red-700' : ''}`}
            onClick={() => {
              useStore.getState().setCtxMenu(null);
              it.run?.();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
