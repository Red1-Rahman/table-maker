import { RATIOS } from '@/core/engine/canvasRatio';
import { THEMES } from '@/core/engine/themes';
import { exportJson } from '@/core/export/jsonExporter';
import { safeFileName } from '@/core/export/batchExporter';
import { useGridHistory } from '@/hooks/useGridHistory';
import { saveDraft } from '@/store/middleware/persistence';
import { useStore } from '@/store/tableStore';
import { useShallow } from 'zustand/react/shallow';
import { saveFile } from '@/utils/platform';
import type { AspectRatioId, LockMode } from '@/types/schema';
import { useEffect, useState } from 'react';
import { Button } from '../common/Button';
import { Dropdown } from '../common/Dropdown';

function confirmDiscard(): boolean {
  const st = useStore.getState();
  return st.past.length === 0 || window.confirm('Discard the current table? Unsaved changes will be lost (draft autosave keeps only the latest table).');
}

export function MainToolbar() {
  const doc = useStore((s) => s.doc);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const { undo, redo, canUndo, canRedo } = useGridHistory();
  const saveState = useStore((s) => s.saveState);
  const [title, setTitle] = useState(doc.title);
  useEffect(() => setTitle(doc.title), [doc.title, doc.id]);
  const st = useStore.getState();
  const toggleView = useStore((s) => s.toggleView);
  const view = useStore(useShallow((s) => ({ m: s.showMargins, b: s.showBleed, p: s.showPageBreaks, h: s.showHeaders, g: s.snapToGrid })));
  const aiOpen = useStore((s) => s.aiBarOpen);

  return (
    <header className="flex h-12 items-center gap-1 border-b border-rule bg-white px-3">
      <img src="./logo.svg" alt="" className="mr-1 h-6 w-6" />
      <input
        aria-label="Table title"
        className="h-8 w-52 rounded border border-transparent bg-transparent px-2 text-[14px] font-semibold hover:border-rule focus:border-accent focus:outline-none"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== doc.title && st.setTitle(title.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <Dropdown
        trigger={<span>File ▾</span>}
        label="File menu"
        items={[
          { label: 'New blank table', onSelect: () => confirmDiscard() && (st.newDocument({}), st.requestFit()) },
          { label: 'New from example', onSelect: () => confirmDiscard() && (st.newDocument({ starter: true }), st.requestFit()) },
          { label: 'Templates…', onSelect: () => st.openModal('templates') },
          { separator: true, label: 's1' },
          { label: 'Import CSV / XLSX / JSON / Markdown…', onSelect: () => window.dispatchEvent(new CustomEvent('tm:pick-import')) },
          { separator: true, label: 's2' },
          {
            label: 'Save draft',
            shortcut: 'Ctrl/Cmd+S',
            onSelect: () => {
              st.setSaveState('saving');
              saveDraft(useStore.getState().doc).then(() => { st.setSaveState('saved'); st.toast('Draft saved on this device.', 'success'); }).catch(() => st.setSaveState('error'));
            },
          },
          { label: 'Save project file (.json)', onSelect: () => saveFile({ name: `${safeFileName(doc.title)}.tablemaker.json`, mime: 'application/json', data: exportJson(doc) }) },
          { label: 'Export…', onSelect: () => st.openModal('export') },
        ]}
      />
      <div className="mx-1 h-5 w-px bg-rule" />
      <Button variant="ghost" size="sm" disabled={!canUndo} onClick={undo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">
        ↶
      </Button>
      <Button variant="ghost" size="sm" disabled={!canRedo} onClick={redo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">
        ↷
      </Button>
      <div className="mx-1 h-5 w-px bg-rule" />
      <select aria-label="Canvas ratio" className="h-8 rounded border border-rule bg-white px-2 text-[12px]" value={doc.aspectRatio} onChange={(e) => st.setAspectRatio(e.target.value as AspectRatioId)}>
        {RATIOS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <select aria-label="Page fit mode" className="h-8 rounded border border-rule bg-white px-2 text-[12px]" value={doc.canvas.lockMode} onChange={(e) => st.setCanvas({ lockMode: e.target.value as LockMode })} title="How the table behaves when it outgrows the page">
        <option value="growth">Lock growth</option>
        <option value="autoscale">Autoscale to fit</option>
        <option value="free">Free (multi-page)</option>
      </select>
      <select aria-label="Theme" className="h-8 rounded border border-rule bg-white px-2 text-[12px]" value={doc.styles.themeId} onChange={(e) => st.setStyles({ themeId: e.target.value, gridColor: '' })}>
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            Theme: {t.name}
          </option>
        ))}
      </select>
      <div className="flex-1" />
      <Dropdown
        trigger={<span>View ▾</span>}
        label="View options"
        align="end"
        items={[
          { label: 'Print margins', checked: view.m, onSelect: () => toggleView('showMargins') },
          { label: 'Bleed bounds', checked: view.b, onSelect: () => toggleView('showBleed') },
          { label: 'Page breaks', checked: view.p, onSelect: () => toggleView('showPageBreaks') },
          { label: 'Row / column headers', checked: view.h, onSelect: () => toggleView('showHeaders') },
          { label: 'Snap resizing to grid', checked: view.g, onSelect: () => toggleView('snapToGrid') },
        ]}
      />
      <div className="flex items-center rounded border border-rule bg-white">
        <Button variant="ghost" size="sm" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.2)}>
          −
        </Button>
        <button type="button" className="h-7 w-14 text-center font-mono text-[12px] hover:bg-black/5" onClick={() => setZoom(1)} title="Reset to 100%" data-testid="zoom-label">
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="sm" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.2)}>
          +
        </Button>
        <Button variant="ghost" size="sm" aria-label="Fit to screen" title="Fit to screen" onClick={st.requestFit}>
          ⤢
        </Button>
      </div>
      <Button active={aiOpen} onClick={() => st.setAiBarOpen(!aiOpen)} title="AI assistant (Ctrl/Cmd+K)">
        ✦ AI
      </Button>
      <Button variant="ghost" size="sm" aria-label="AI keys" title="AI keys" onClick={() => st.openModal('keys')}>
        🔑
      </Button>
      <Button variant="primary" onClick={() => st.openModal('export')}>
        Export
      </Button>
      <Button variant="ghost" size="sm" aria-label="Help" onClick={() => st.openModal('help')}>
        ?
      </Button>
      <span className="ml-1 w-16 text-right text-[11px] text-ink-soft" aria-live="polite">
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : ''}
      </span>
    </header>
  );
}
