import { FONTS } from '@/core/engine/fonts';
import { resolveStyle } from '@/core/engine/resolve';
import { resolveOrigin } from '@/core/engine/gridMatrix';
import { useStore } from '@/store/tableStore';
import type { BorderMode } from '@/core/engine/gridMatrix';
import { Button } from '../common/Button';
import { Dropdown } from '../common/Dropdown';

const BORDER_ITEMS: { label: string; mode: BorderMode }[] = [
  { label: 'All borders', mode: 'all' },
  { label: 'Outer border', mode: 'outer' },
  { label: 'Inner borders', mode: 'inner' },
  { label: 'Top border', mode: 'top' },
  { label: 'Bottom border', mode: 'bottom' },
  { label: 'Left border', mode: 'left' },
  { label: 'Right border', mode: 'right' },
];

function ColorButton({ label, value, onChange, glyph }: { label: string; value: string; onChange: (c: string) => void; glyph: string }) {
  return (
    <label className="relative inline-flex h-7 w-8 cursor-pointer flex-col items-center justify-center rounded border border-transparent text-[13px] hover:bg-black/5" title={label}>
      <span className="font-semibold leading-none">{glyph}</span>
      <span className="mt-0.5 h-1 w-4 rounded-sm" style={{ background: value }} />
      <input aria-label={label} type="color" value={value.length === 7 ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

const Sep = () => <div className="mx-1 h-5 w-px bg-rule" />;

/** Formatting bar: font, emphasis, colours, alignment, borders, merge, structure. */
export function FormatControls() {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selection);
  const st = useStore.getState();
  const o = resolveOrigin(doc, sel.focus.r, sel.focus.c);
  const cur = resolveStyle(doc, o.r, o.c);
  const style = useStore((s) => s.styleSelection);
  const toggle = useStore((s) => s.toggleStyle);
  const rg = st.selectionRange();
  const lineSpec = { width: 1, style: 'solid' as const, color: '#17202e' };

  return (
    <div className="flex h-10 flex-wrap items-center gap-0.5 overflow-x-auto border-b border-rule bg-chrome px-2" role="toolbar" aria-label="Formatting">
      <select aria-label="Font family" className="h-7 w-24 rounded border border-rule bg-white px-1 text-[12px]" value={FONTS.some((f) => f.id === cur.fontFamily) ? cur.fontFamily : 'sans'} onChange={(e) => style({ fontFamily: e.target.value })}>
        {FONTS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <input
        aria-label="Font size"
        type="number"
        min={6}
        max={96}
        className="ml-1 h-7 w-14 rounded border border-rule bg-white px-1 text-center text-[12px]"
        value={cur.fontSize}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (n >= 6 && n <= 96) style({ fontSize: n });
        }}
      />
      <Sep />
      <Button variant="ghost" size="sm" active={cur.bold} aria-label="Bold" title="Bold (Ctrl/Cmd+B)" onClick={() => toggle('bold')}>
        <b>B</b>
      </Button>
      <Button variant="ghost" size="sm" active={cur.italic} aria-label="Italic" title="Italic (Ctrl/Cmd+I)" onClick={() => toggle('italic')}>
        <i>I</i>
      </Button>
      <Button variant="ghost" size="sm" active={cur.underline} aria-label="Underline" title="Underline (Ctrl/Cmd+U)" onClick={() => toggle('underline')}>
        <u>U</u>
      </Button>
      <Button variant="ghost" size="sm" active={cur.strike} aria-label="Strikethrough" title="Strikethrough (Ctrl/Cmd+Shift+X)" onClick={() => toggle('strike')}>
        <s>S</s>
      </Button>
      <Sep />
      <ColorButton label="Text colour" glyph="A" value={cur.color} onChange={(c) => style({ color: c })} />
      <ColorButton label="Fill colour" glyph="▮" value={cur.bg} onChange={(c) => style({ bg: c })} />
      <Sep />
      {(['left', 'center', 'right'] as const).map((a) => (
        <Button key={a} variant="ghost" size="sm" active={cur.align === a} aria-label={`Align ${a}`} title={`Align ${a}`} onClick={() => style({ align: a })}>
          {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
        </Button>
      ))}
      {(['top', 'middle', 'bottom'] as const).map((a) => (
        <Button key={a} variant="ghost" size="sm" active={cur.valign === a} aria-label={`Align ${a}`} title={`Vertical ${a}`} onClick={() => style({ valign: a })}>
          {a === 'top' ? '⤒' : a === 'middle' ? '⇳' : '⤓'}
        </Button>
      ))}
      <Button variant="ghost" size="sm" active={cur.wrap} aria-label="Wrap text" title="Wrap text" onClick={() => style({ wrap: !cur.wrap })}>
        ↩
      </Button>
      <Button variant="ghost" size="sm" active={cur.list === 'bullet'} aria-label="Bullet list" title="Bulleted list (one item per line)" onClick={() => style({ list: cur.list === 'bullet' ? undefined : 'bullet' })}>
        •≡
      </Button>
      <Button variant="ghost" size="sm" active={cur.list === 'number'} aria-label="Numbered list" title="Numbered list" onClick={() => style({ list: cur.list === 'number' ? undefined : 'number' })}>
        1.
      </Button>
      <Button variant="ghost" size="sm" aria-label="Checkbox" title="Turn selection into checkboxes" onClick={() => useStore.getState().commit((d) => {
        for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) {
          const cell = d.cells[`${r}:${c}`] ?? (d.cells[`${r}:${c}`] = { value: '', type: 'text' });
          cell.type = 'boolean';
          cell.value = /^true$/i.test(cell.value) ? 'TRUE' : 'FALSE';
        }
      })}>
        ☑
      </Button>
      <Sep />
      <Dropdown trigger={<span>▦ Borders ▾</span>} label="Borders" items={[...BORDER_ITEMS.map((b) => ({ label: b.label, onSelect: () => st.bordersSelection(b.mode, lineSpec) })), { separator: true, label: 's1' }, { label: 'Hide borders', onSelect: () => st.bordersSelection('all', { ...lineSpec, width: 0 }) }, { label: 'Reset to theme grid', onSelect: () => st.bordersSelection('all', null) }]} />
      <Button variant="ghost" size="sm" title="Merge cells" aria-label="Merge cells" onClick={() => useStore.getState().mergeSelection()}>
        ⊞ Merge
      </Button>
      <Button variant="ghost" size="sm" title="Unmerge cells" aria-label="Unmerge cells" onClick={() => useStore.getState().unmergeSelection()}>
        ⊟
      </Button>
      <Sep />
      <Dropdown
        trigger={<span>Rows & columns ▾</span>}
        label="Rows and columns"
        items={[
          { label: 'Insert row above', onSelect: () => st.insertRows(rg.r1) },
          { label: 'Insert row below', onSelect: () => st.insertRows(rg.r2 + 1) },
          { label: 'Insert column left', onSelect: () => st.insertCols(rg.c1) },
          { label: 'Insert column right', onSelect: () => st.insertCols(rg.c2 + 1) },
          { separator: true, label: 's' },
          { label: 'Delete selected rows', onSelect: () => st.deleteRows(rg.r1, rg.r2 - rg.r1 + 1) },
          { label: 'Delete selected columns', onSelect: () => st.deleteCols(rg.c1, rg.c2 - rg.c1 + 1) },
          { separator: true, label: 's2' },
          { label: 'Freeze rows up to selection', onSelect: () => st.setFrozen(rg.r2 + 1, doc.frozen.cols) },
          { label: 'Freeze columns up to selection', onSelect: () => st.setFrozen(doc.frozen.rows, rg.c2 + 1) },
          { label: 'Unfreeze', onSelect: () => st.setFrozen(0, 0) },
        ]}
      />
      <Dropdown
        trigger={<span>Data ▾</span>}
        label="Data"
        items={[
          { label: 'Sort column A → Z', onSelect: () => st.sortByColumn(sel.focus.c, 'asc') },
          { label: 'Sort column Z → A', onSelect: () => st.sortByColumn(sel.focus.c, 'desc') },
          { separator: true, label: 's' },
          { label: 'Filter column… (Rules tab)', onSelect: () => st.setInspector(true, 'rules') },
          { label: 'Clear all filters', onSelect: () => st.setFilters([]), disabled: doc.filters.length === 0 },
        ]}
      />
      <Button variant="ghost" size="sm" aria-label="Insert image" title="Insert image into the selected cell" onClick={() => window.dispatchEvent(new CustomEvent('tm:pick-image'))}>
        🖼 Image
      </Button>
    </div>
  );
}
