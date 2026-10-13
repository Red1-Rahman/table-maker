import { cellToA1, colToLetters, parseRange, rangeToA1 } from '@/core/engine/address';
import { RATIOS } from '@/core/engine/canvasRatio';
import { FONTS } from '@/core/engine/fonts';
import { resolveOrigin } from '@/core/engine/gridMatrix';
import { THEMES } from '@/core/engine/themes';
import { VALIDATION_LABELS } from '@/core/engine/validation';
import { gridLineColor } from '@/core/engine/resolve';
import { type InspectorTab } from '@/store/slices/uiSlice';
import { useStore } from '@/store/tableStore';
import { useShallow } from 'zustand/react/shallow';
import type { BorderSpec, CellRange, CondOp, FilterRule, ImageFitMode, LockMode, ValidationType } from '@/types/schema';
import { cellKey } from '@/types/schema';
import { uid } from '@/utils/id';
import { useState } from 'react';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';

const num = (v: string, fallback: number) => (v.trim() === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function TableTab() {
  const doc = useStore((s) => s.doc);
  const st = useStore.getState();
  const view = useStore(useShallow((s) => ({ m: s.showMargins, b: s.showBleed, p: s.showPageBreaks, h: s.showHeaders, g: s.snapToGrid })));
  const toggleView = useStore((s) => s.toggleView);
  return (
    <div>
      <h3 className="section-title">Theme</h3>
      <div className="grid grid-cols-4 gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.name}
            onClick={() => st.setStyles({ themeId: t.id, gridColor: '' })}
            className={`overflow-hidden rounded border text-[10px] ${doc.styles.themeId === t.id ? 'border-accent ring-2 ring-accent/40' : 'border-rule'}`}
          >
            <div style={{ background: t.headerBg, color: t.headerText }} className="px-1 py-1">
              {t.name}
            </div>
            <div style={{ background: t.zebraBg, height: 8 }} />
            <div style={{ background: t.bg, height: 8 }} />
          </button>
        ))}
      </div>
      <Checkbox checked={doc.styles.zebra} onChange={(v) => st.setStyles({ zebra: v })}>
        Zebra striping
      </Checkbox>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Row label="Header rows">
          <input className="field" type="number" min={0} max={10} value={doc.styles.headerRows} onChange={(e) => st.setStyles({ headerRows: Math.max(0, Math.min(10, num(e.target.value, 1))) })} />
        </Row>
        <Row label="Cell padding (px)">
          <input className="field" type="number" min={0} max={40} value={doc.styles.cellPadding} onChange={(e) => st.setStyles({ cellPadding: Math.max(0, Math.min(40, num(e.target.value, 8))) })} />
        </Row>
        <Row label="Base font">
          <select className="field" value={doc.styles.fontFamily} onChange={(e) => st.setStyles({ fontFamily: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Base size (px)">
          <input className="field" type="number" min={6} max={96} value={doc.styles.fontSize} onChange={(e) => st.setStyles({ fontSize: Math.max(6, Math.min(96, num(e.target.value, 14))) })} />
        </Row>
      </div>
      <h3 className="section-title">Grid lines</h3>
      <div className="grid grid-cols-3 gap-2">
        <Row label="Style">
          <select className="field" value={doc.styles.gridStyle} onChange={(e) => st.setStyles({ gridStyle: e.target.value as 'solid' })}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="none">None</option>
          </select>
        </Row>
        <Row label="Width">
          <input className="field" type="number" min={0} max={6} step={0.5} value={doc.styles.gridWidth} onChange={(e) => st.setStyles({ gridWidth: Math.max(0, Math.min(6, num(e.target.value, 1))) })} />
        </Row>
        <Row label="Colour">
          <input aria-label="Grid colour" className="h-8 w-full cursor-pointer rounded border border-rule bg-white p-0.5" type="color" value={gridLineColor(doc)} onChange={(e) => st.setStyles({ gridColor: e.target.value })} />
        </Row>
      </div>

      <h3 className="section-title">Page</h3>
      <Row label="Aspect ratio">
        <select className="field" value={doc.aspectRatio} onChange={(e) => st.setAspectRatio(e.target.value as 'custom')}>
          {RATIOS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </Row>
      {doc.aspectRatio === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Width (px)">
            <input className="field" type="number" min={100} max={8000} value={doc.dimensions.customWidthPx ?? 800} onChange={(e) => st.setAspectRatio('custom', { w: num(e.target.value, 800), h: doc.dimensions.customHeightPx ?? 600 })} />
          </Row>
          <Row label="Height (px)">
            <input className="field" type="number" min={100} max={8000} value={doc.dimensions.customHeightPx ?? 600} onChange={(e) => st.setAspectRatio('custom', { w: doc.dimensions.customWidthPx ?? 800, h: num(e.target.value, 600) })} />
          </Row>
        </div>
      )}
      <Row label="When the table outgrows the page">
        {(
          [
            ['growth', 'Lock growth', 'Block adding rows/columns that would not fit'],
            ['autoscale', 'Autoscale', 'Shrink the table to fit the page'],
            ['free', 'Free', 'Let the page grow in whole pages (PDF paginates)'],
          ] as [LockMode, string, string][]
        ).map(([id, name, hint]) => (
          <label key={id} className="mb-1 flex cursor-pointer items-start gap-2 text-[13px]">
            <input type="radio" name="lock" className="mt-0.5 accent-[#2f5bea]" checked={doc.canvas.lockMode === id} onChange={() => st.setCanvas({ lockMode: id })} />
            <span>
              {name}
              <span className="block text-[11px] text-ink-soft">{hint}</span>
            </span>
          </label>
        ))}
      </Row>
      <div className="grid grid-cols-3 gap-2">
        <Row label="Margin">
          <input className="field" type="number" min={0} max={200} value={doc.canvas.margin} onChange={(e) => st.setCanvas({ margin: Math.max(0, Math.min(200, num(e.target.value, 40))) })} />
        </Row>
        <Row label="Bleed">
          <input className="field" type="number" min={0} max={100} value={doc.canvas.bleed} onChange={(e) => st.setCanvas({ bleed: Math.max(0, Math.min(100, num(e.target.value, 12))) })} />
        </Row>
        <Row label="Page colour">
          <input aria-label="Page colour" className="h-8 w-full cursor-pointer rounded border border-rule bg-white p-0.5" type="color" value={doc.canvas.bg.length === 7 ? doc.canvas.bg : '#ffffff'} onChange={(e) => st.setCanvas({ bg: e.target.value })} />
        </Row>
      </div>

      <h3 className="section-title">View & freeze</h3>
      <div className="space-y-1.5">
        <Checkbox checked={view.m} onChange={() => toggleView('showMargins')}>Print margins</Checkbox>
        <Checkbox checked={view.b} onChange={() => toggleView('showBleed')}>Bleed bounds</Checkbox>
        <Checkbox checked={view.p} onChange={() => toggleView('showPageBreaks')}>Page breaks</Checkbox>
        <Checkbox checked={view.h} onChange={() => toggleView('showHeaders')}>Row / column headers</Checkbox>
        <Checkbox checked={view.g} onChange={() => toggleView('snapToGrid')}>Snap resizing to 8 px grid</Checkbox>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Row label="Frozen rows">
          <input className="field" type="number" min={0} max={doc.rows.length - 1} value={doc.frozen.rows} onChange={(e) => st.setFrozen(num(e.target.value, 0), doc.frozen.cols)} />
        </Row>
        <Row label="Frozen columns">
          <input className="field" type="number" min={0} max={doc.columns.length - 1} value={doc.frozen.cols} onChange={(e) => st.setFrozen(doc.frozen.rows, num(e.target.value, 0))} />
        </Row>
      </div>
    </div>
  );
}

function CellTab() {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selection);
  const autoSize = useStore((s) => s.autoSizeImages);
  const setAutoSize = useStore((s) => s.setAutoSizeImages);
  const st = useStore.getState();
  const [bw, setBw] = useState(1);
  const [bs, setBs] = useState<BorderSpec['style']>('solid');
  const [bc, setBc] = useState('#17202e');
  const o = resolveOrigin(doc, sel.focus.r, sel.focus.c);
  const cell = doc.cells[cellKey(o.r, o.c)];
  const spec: BorderSpec = { width: bw, style: bs, color: bc };
  const fits: ImageFitMode[] = ['contain', 'cover', 'stretch', 'original', 'center'];
  return (
    <div>
      <h3 className="section-title">Selected cell {cellToA1(o.r, o.c)}</h3>
      <p className="mb-3 text-[12px] text-ink-soft">Type: {cell?.type ?? 'empty'}</p>
      <Row label="Padding (px)">
        <input className="field" type="number" min={0} max={40} placeholder={String(doc.styles.cellPadding)} value={cell?.style?.padding ?? ''} onChange={(e) => st.styleSelection({ padding: e.target.value === '' ? undefined : Math.max(0, Math.min(40, num(e.target.value, 8))) })} />
      </Row>
      <h3 className="section-title">Borders for selection</h3>
      <div className="grid grid-cols-3 gap-2">
        <Row label="Width">
          <input className="field" type="number" min={0.5} max={8} step={0.5} value={bw} onChange={(e) => setBw(Math.max(0.5, Math.min(8, num(e.target.value, 1))))} />
        </Row>
        <Row label="Style">
          <select className="field" value={bs} onChange={(e) => setBs(e.target.value as BorderSpec['style'])}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </Row>
        <Row label="Colour">
          <input aria-label="Border colour" className="h-8 w-full cursor-pointer rounded border border-rule bg-white p-0.5" type="color" value={bc} onChange={(e) => setBc(e.target.value)} />
        </Row>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(['all', 'outer', 'inner', 'top', 'bottom', 'left', 'right', 'horizontal', 'vertical'] as const).map((m) => (
          <Button key={m} size="sm" onClick={() => st.bordersSelection(m, spec)}>
            {m}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" onClick={() => st.bordersSelection('all', { ...spec, width: 0 })}>Hide</Button>
        <Button size="sm" onClick={() => st.bordersSelection('all', null)}>Reset to theme</Button>
      </div>
      {cell?.type === 'image' && cell.imageConfig && (
        <>
          <h3 className="section-title">Image</h3>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {fits.map((f) => (
              <Button key={f} size="sm" active={cell.imageConfig?.fitMode === f} onClick={() => st.setImageFit(f)}>
                {f}
              </Button>
            ))}
          </div>
          <Row label="Alt text">
            <input
              className="field"
              defaultValue={cell.imageConfig.altText ?? ''}
              key={`${o.r}:${o.c}`}
              onBlur={(e) => st.commit((d) => {
                const c = d.cells[cellKey(o.r, o.c)];
                if (c?.imageConfig) {
                  c.imageConfig.altText = e.target.value;
                  c.value = e.target.value;
                }
              })}
            />
          </Row>
        </>
      )}
      <h3 className="section-title">Images</h3>
      <Checkbox checked={autoSize} onChange={setAutoSize}>
        Auto-adjust row height when an image is dropped
      </Checkbox>
      <p className="mt-2 text-[12px] text-ink-soft">Drop PNG / JPEG / SVG onto a cell, paste an image, or use Insert image. Merge cells first for large images.</p>
    </div>
  );
}

const OP_LABEL: Record<CondOp, string> = {
  gt: 'is greater than', lt: 'is less than', eq: 'equals', contains: 'contains', between: 'is between', dateBetween: 'date between', colorScale: 'colour scale', dataBar: 'data bars',
};

function RulesTab() {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.selection);
  const st = useStore.getState();
  const defaultRange = rangeToA1(st.selectionRange());
  // conditional form
  const [cfRange, setCfRange] = useState('');
  const [cfOp, setCfOp] = useState<CondOp>('gt');
  const [cfV1, setCfV1] = useState('');
  const [cfV2, setCfV2] = useState('');
  const [cfBg, setCfBg] = useState('#c8f2d4');
  const [cfFg, setCfFg] = useState('#14532d');
  const [cfScaleMin, setCfScaleMin] = useState('#ffffff');
  const [cfScaleMax, setCfScaleMax] = useState('#2f5bea');
  // validation form
  const [vRange, setVRange] = useState('');
  const [vType, setVType] = useState<ValidationType>('number');
  const [vOpts, setVOpts] = useState('');
  const [vMin, setVMin] = useState('');
  const [vMax, setVMax] = useState('');
  // filter form
  const [fCol, setFCol] = useState(0);
  const [fOp, setFOp] = useState<FilterRule['op']>('contains');
  const [fV1, setFV1] = useState('');
  const [fV2, setFV2] = useState('');

  const parse = (text: string): CellRange | null => {
    const rg = parseRange((text || defaultRange).trim());
    if (!rg || rg.r2 >= doc.rows.length || rg.c2 >= doc.columns.length) {
      st.toast('Enter a valid range like B2:B20 inside the table.', 'error');
      return null;
    }
    return rg;
  };
  const cfNeedsValue = !['colorScale', 'dataBar'].includes(cfOp);

  return (
    <div>
      <h3 className="section-title">Conditional formatting</h3>
      {doc.conditionalRules.length === 0 && <p className="mb-2 text-[12px] text-ink-soft">No rules yet.</p>}
      {doc.conditionalRules.map((r) => (
        <div key={r.id} className="mb-1.5 flex items-center justify-between rounded border border-rule bg-chrome px-2 py-1 text-[12px]">
          <span>
            {rangeToA1(r.range)} {OP_LABEL[r.op]} {r.value ?? ''} {r.value2 ? `and ${r.value2}` : ''}
          </span>
          <button type="button" aria-label="Remove rule" className="px-1 text-ink-soft hover:text-red-700" onClick={() => st.setConditionalRules(doc.conditionalRules.filter((x) => x.id !== r.id))}>
            ✕
          </button>
        </div>
      ))}
      <div className="rounded border border-rule p-2">
        <div className="grid grid-cols-2 gap-2">
          <Row label="Range">
            <input className="field" placeholder={defaultRange} value={cfRange} onChange={(e) => setCfRange(e.target.value)} />
          </Row>
          <Row label="Rule">
            <select className="field" value={cfOp} onChange={(e) => setCfOp(e.target.value as CondOp)}>
              {(Object.keys(OP_LABEL) as CondOp[]).map((o) => (
                <option key={o} value={o}>{OP_LABEL[o]}</option>
              ))}
            </select>
          </Row>
        </div>
        {cfNeedsValue && (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Value"><input className="field" value={cfV1} onChange={(e) => setCfV1(e.target.value)} /></Row>
            {(cfOp === 'between' || cfOp === 'dateBetween') && <Row label="and"><input className="field" value={cfV2} onChange={(e) => setCfV2(e.target.value)} /></Row>}
          </div>
        )}
        {cfOp === 'colorScale' ? (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Low"><input aria-label="Low colour" type="color" className="h-8 w-full" value={cfScaleMin} onChange={(e) => setCfScaleMin(e.target.value)} /></Row>
            <Row label="High"><input aria-label="High colour" type="color" className="h-8 w-full" value={cfScaleMax} onChange={(e) => setCfScaleMax(e.target.value)} /></Row>
          </div>
        ) : cfOp === 'dataBar' ? (
          <Row label="Bar colour"><input aria-label="Bar colour" type="color" className="h-8 w-full" value={cfBg} onChange={(e) => setCfBg(e.target.value)} /></Row>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Fill"><input aria-label="Highlight fill" type="color" className="h-8 w-full" value={cfBg} onChange={(e) => setCfBg(e.target.value)} /></Row>
            <Row label="Text"><input aria-label="Highlight text" type="color" className="h-8 w-full" value={cfFg} onChange={(e) => setCfFg(e.target.value)} /></Row>
          </div>
        )}
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            const range = parse(cfRange);
            if (!range) return;
            if (cfNeedsValue && cfV1.trim() === '') return st.toast('Enter a value for the rule.', 'error');
            st.setConditionalRules([
              ...doc.conditionalRules,
              {
                id: uid('cf'), range, op: cfOp, value: cfNeedsValue ? cfV1 : undefined, value2: cfV2 || undefined,
                style: cfOp === 'colorScale' || cfOp === 'dataBar' ? undefined : { bg: cfBg, color: cfFg },
                scale: cfOp === 'colorScale' ? { min: cfScaleMin, max: cfScaleMax } : undefined,
                barColor: cfOp === 'dataBar' ? cfBg : undefined,
              },
            ]);
          }}
        >
          Add rule
        </Button>
      </div>

      <h3 className="section-title">Data validation</h3>
      {doc.validations.map((v) => (
        <div key={v.id} className="mb-1.5 flex items-center justify-between rounded border border-rule bg-chrome px-2 py-1 text-[12px]">
          <span>
            {rangeToA1(v.range)} · {VALIDATION_LABELS[v.type]}
            {v.options ? ` (${v.options.join(', ')})` : ''}
          </span>
          <button type="button" aria-label="Remove validation" className="px-1 text-ink-soft hover:text-red-700" onClick={() => st.setValidations(doc.validations.filter((x) => x.id !== v.id))}>
            ✕
          </button>
        </div>
      ))}
      <div className="rounded border border-rule p-2">
        <div className="grid grid-cols-2 gap-2">
          <Row label="Range"><input className="field" placeholder={defaultRange} value={vRange} onChange={(e) => setVRange(e.target.value)} /></Row>
          <Row label="Allow">
            <select className="field" value={vType} onChange={(e) => setVType(e.target.value as ValidationType)}>
              {(Object.keys(VALIDATION_LABELS) as ValidationType[]).map((t) => (
                <option key={t} value={t}>{VALIDATION_LABELS[t]}</option>
              ))}
            </select>
          </Row>
        </div>
        {vType === 'select' && <Row label="Options (comma separated)"><input className="field" value={vOpts} onChange={(e) => setVOpts(e.target.value)} /></Row>}
        {vType === 'number' && (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Min"><input className="field" type="number" value={vMin} onChange={(e) => setVMin(e.target.value)} /></Row>
            <Row label="Max"><input className="field" type="number" value={vMax} onChange={(e) => setVMax(e.target.value)} /></Row>
          </div>
        )}
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            const range = parse(vRange);
            if (!range) return;
            const options = vOpts.split(',').map((x) => x.trim()).filter(Boolean);
            if (vType === 'select' && options.length === 0) return st.toast('Add at least one option.', 'error');
            st.setValidations([
              ...doc.validations,
              { id: uid('dv'), range, type: vType, options: vType === 'select' ? options : undefined, min: vMin === '' ? undefined : Number(vMin), max: vMax === '' ? undefined : Number(vMax) },
            ]);
            if (vType === 'checkbox')
              st.commit((d) => {
                for (let r = range.r1; r <= range.r2; r++)
                  for (let c = range.c1; c <= range.c2; c++) {
                    const cell = d.cells[cellKey(r, c)] ?? (d.cells[cellKey(r, c)] = { value: '', type: 'text' });
                    cell.type = 'boolean';
                    cell.value = /^true$/i.test(cell.value) ? 'TRUE' : 'FALSE';
                  }
              });
          }}
        >
          Add validation
        </Button>
      </div>

      <h3 className="section-title">Filters</h3>
      {doc.filters.map((f) => (
        <div key={f.id} className="mb-1.5 flex items-center justify-between rounded border border-rule bg-chrome px-2 py-1 text-[12px]">
          <span>Column {colToLetters(f.col)} {f.op} {f.value ?? ''}{f.value2 ? ` – ${f.value2}` : ''}</span>
          <button type="button" aria-label="Remove filter" className="px-1 text-ink-soft hover:text-red-700" onClick={() => st.setFilters(doc.filters.filter((x) => x.id !== f.id))}>✕</button>
        </div>
      ))}
      <div className="rounded border border-rule p-2">
        <div className="grid grid-cols-2 gap-2">
          <Row label="Column">
            <select className="field" value={fCol} onChange={(e) => setFCol(Number(e.target.value))}>
              {doc.columns.map((_, i) => (
                <option key={i} value={i}>{colToLetters(i)}</option>
              ))}
            </select>
          </Row>
          <Row label="Keep rows where value">
            <select className="field" value={fOp} onChange={(e) => setFOp(e.target.value as FilterRule['op'])}>
              <option value="contains">contains</option>
              <option value="notContains">does not contain</option>
              <option value="eq">equals</option>
              <option value="gt">is greater than</option>
              <option value="lt">is less than</option>
              <option value="between">is between</option>
              <option value="notEmpty">is not empty</option>
              <option value="checked">is checked</option>
              <option value="unchecked">is unchecked</option>
            </select>
          </Row>
        </div>
        {!['notEmpty', 'checked', 'unchecked'].includes(fOp) && (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Value"><input className="field" value={fV1} onChange={(e) => setFV1(e.target.value)} /></Row>
            {fOp === 'between' && <Row label="and"><input className="field" value={fV2} onChange={(e) => setFV2(e.target.value)} /></Row>}
          </div>
        )}
        <Button size="sm" variant="primary" onClick={() => st.setFilters([...doc.filters, { id: uid('f'), col: fCol, op: fOp, value: fV1, value2: fV2 || undefined }])}>
          Add filter
        </Button>
        <p className="mt-2 text-[11px] text-ink-soft">Filters hide rows below the header. Hidden rows are also left out of exports.</p>
      </div>
      <span className="hidden">{sel.focus.r}</span>
    </div>
  );
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'table', label: 'Table' },
  { id: 'cell', label: 'Cell' },
  { id: 'rules', label: 'Rules' },
];

export function Inspector() {
  const tab = useStore((s) => s.inspectorTab);
  const setInspector = useStore((s) => s.setInspector);
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-rule bg-white" aria-label="Inspector">
      <div className="flex border-b border-rule" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`flex-1 border-b-2 px-3 py-2 text-[13px] ${tab === t.id ? 'border-accent font-semibold text-accent' : 'border-transparent text-ink-soft hover:bg-black/5'}`}
            onClick={() => setInspector(true, t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">{tab === 'table' ? <TableTab /> : tab === 'cell' ? <CellTab /> : <RulesTab />}</div>
    </aside>
  );
}
