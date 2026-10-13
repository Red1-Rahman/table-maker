import { exportBatch } from '@/core/export/batchExporter';
import { useStore } from '@/store/tableStore';
import { EXPORT_FORMATS, type ExportFormat } from '@/types/export';
import { saveFiles } from '@/utils/platform';
import { useState } from 'react';
import { ExportOverlay } from '../canvas/ExportOverlay';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Modal } from '../common/Modal';

const DESCRIPTIONS: Record<ExportFormat, string> = {
  csv: 'Computed values, UTF-8',
  xlsx: 'Formulas, fills, borders, merges',
  md: 'GitHub-style pipe table',
  html: 'Styled, sanitised table',
  json: 'Data + full lossless document',
  pdf: 'Vector, paginated by page ratio',
  png: 'High-DPI image of the page',
};

export function MultiFormatExportModal() {
  const open = useStore((s) => s.modal === 'export');
  const close = () => useStore.getState().openModal(null);
  const doc = useStore((s) => s.doc);
  const [formats, setFormats] = useState<Record<ExportFormat, boolean>>({ csv: true, xlsx: true, md: true, html: true, json: true, pdf: true, png: true });
  const [zip, setZip] = useState(true);
  const [pixelRatio, setPixelRatio] = useState(3);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const selected = EXPORT_FORMATS.filter((f) => formats[f.id]).map((f) => f.id);

  const run = async () => {
    setBusy(true);
    setMsg('');
    const t0 = performance.now();
    try {
      const files = await exportBatch(doc, { formats: selected, zip, baseName: name || doc.title, pixelRatio });
      await saveFiles(files);
      setMsg(`Exported ${selected.length} format${selected.length > 1 ? 's' : ''} in ${((performance.now() - t0) / 1000).toFixed(2)} s`);
    } catch (e) {
      setMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Export"
      description="Pick one or more formats and download them in one click."
      width="max-w-3xl"
      footer={
        <>
          <span className="mr-auto text-[12px] text-ink-soft" aria-live="polite">{msg}</span>
          <Button onClick={close}>Close</Button>
          <Button variant="primary" disabled={busy || selected.length === 0} onClick={run}>
            {busy ? 'Exporting…' : 'Download selected'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_300px]">
        <div>
          <div className="grid grid-cols-1 gap-1.5">
            {EXPORT_FORMATS.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded border border-rule px-3 py-2">
                <Checkbox checked={formats[f.id]} onChange={(v) => setFormats((s) => ({ ...s, [f.id]: v }))}>
                  <span className="font-medium">{f.label}</span> <span className="font-mono text-[11px] text-ink-soft">(.{f.ext})</span>
                </Checkbox>
                <span className="text-[11px] text-ink-soft">{DESCRIPTIONS[f.id]}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">File name</span>
              <input className="field" placeholder={doc.title} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Image / raster resolution</span>
              <select className="field" value={pixelRatio} onChange={(e) => setPixelRatio(Number(e.target.value))}>
                <option value={1}>1× (screen)</option>
                <option value={2}>2×</option>
                <option value={3}>3× (print, default)</option>
                <option value={4}>4× (very large)</option>
              </select>
            </label>
          </div>
          <div className="mt-3">
            <Checkbox checked={zip} onChange={setZip}>
              Package multiple files in one .zip
            </Checkbox>
          </div>
          {doc.filters.length > 0 && <p className="mt-2 text-[12px] text-ink-soft">Filtered-out rows are not included.</p>}
        </div>
        {open && <ExportOverlay />}
      </div>
    </Modal>
  );
}
