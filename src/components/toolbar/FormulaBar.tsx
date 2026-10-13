import { cellToA1, rangeToA1 } from '@/core/engine/address';
import { resolveOrigin } from '@/core/engine/gridMatrix';
import { cellValue } from '@/core/engine/evaluate';
import { FormulaErr, toStr } from '@/core/engine/formulaEngine';
import { selectionToRange } from '@/store/slices/gridSlice';
import { useStore } from '@/store/tableStore';
import { cellKey } from '@/types/schema';
import { useEffect, useState } from 'react';

/** Cell address + raw value / formula entry, with live evaluation feedback. */
export function FormulaBar() {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selection);
  const rg = selectionToRange(doc, sel);
  const o = resolveOrigin(doc, sel.focus.r, sel.focus.c);
  const raw = doc.cells[cellKey(o.r, o.c)]?.value ?? '';
  const isImage = doc.cells[cellKey(o.r, o.c)]?.type === 'image';
  const [draft, setDraft] = useState(raw);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(raw);
  }, [raw, focused, o.r, o.c]);

  const preview = draft.startsWith('=') && draft.length > 1 ? cellValue({ cells: { ...doc.cells, [cellKey(o.r, o.c)]: { value: draft, type: 'text' } } }, o.r, o.c) : null;
  const err = preview instanceof FormulaErr ? preview.code : null;

  return (
    <div className="flex h-9 items-center gap-2 border-b border-rule bg-white px-3">
      <div className="w-24 rounded border border-rule bg-chrome px-2 py-1 text-center font-mono text-[12px]" data-testid="address">
        {rg.r1 === rg.r2 && rg.c1 === rg.c2 ? cellToA1(o.r, o.c) : rangeToA1(rg)}
      </div>
      <span className="font-mono text-[13px] italic text-ink-soft">fx</span>
      <input
        aria-label="Formula bar"
        data-testid="formula-input"
        className="h-7 flex-1 rounded border border-transparent px-2 font-mono text-[13px] hover:border-rule focus:border-accent focus:outline-none"
        value={isImage ? '(image)' : draft}
        disabled={isImage}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          if (draft !== raw && !useStore.getState().setCellValue(o.r, o.c, draft)) setDraft(raw);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (useStore.getState().setCellValue(o.r, o.c, draft)) {
              (e.target as HTMLElement).blur();
              useStore.getState().moveSelection(1, 0);
            }
          } else if (e.key === 'Escape') {
            setDraft(raw);
            (e.target as HTMLElement).blur();
          }
        }}
      />
      {preview !== null && (
        <span className={`max-w-[220px] truncate font-mono text-[12px] ${err ? 'text-red-700' : 'text-ink-soft'}`} title={toStr(preview)}>
          = {toStr(preview)}
        </span>
      )}
    </div>
  );
}
