import { normalizeSchema } from '@/core/engine/schemaUtil';
import { useStore } from '@/store/tableStore';
import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';

interface Entry {
  id: string;
  name: string;
  description: string;
  file: string;
}

export function TemplatesModal() {
  const open = useStore((s) => s.modal === 'templates');
  const [list, setList] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || list) return;
    fetch(`${import.meta.env.BASE_URL}templates/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then(setList)
      .catch(() => setError('Could not load templates.'));
  }, [open, list]);

  const use = async (e: Entry) => {
    const st = useStore.getState();
    if (st.past.length > 0 && !window.confirm('Replace the current table with this template?')) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}templates/${e.file}`);
      st.loadDocument(normalizeSchema(await res.json()));
      st.openModal(null);
      st.requestFit();
    } catch {
      st.toast('Could not load that template.', 'error');
    }
  };

  return (
    <Modal open={open} onClose={() => useStore.getState().openModal(null)} title="Templates" description="Start from a ready-made layout." width="max-w-xl">
      {error && <p className="text-[13px] text-red-700">{error}</p>}
      {!list && !error && <p className="text-[13px] text-ink-soft">Loading…</p>}
      <div className="grid gap-2">
        {list?.map((t) => (
          <button key={t.id} type="button" onClick={() => use(t)} className="rounded border border-rule px-4 py-3 text-left hover:border-accent hover:bg-accent-soft">
            <div className="text-[14px] font-semibold">{t.name}</div>
            <div className="text-[12px] text-ink-soft">{t.description}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
