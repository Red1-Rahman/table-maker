import { PROVIDER_INFO } from '@/core/ai/client';
import { useStore } from '@/store/tableStore';
import { useState } from 'react';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Modal } from '../common/Modal';

/** Bring-your-own-key manager. Keys live only in this browser's localStorage. */
export function KeyManagerModal() {
  const open = useStore((s) => s.modal === 'keys');
  const ai = useStore((s) => s.ai);
  const st = useStore.getState();
  const [show, setShow] = useState<Record<string, boolean>>({});
  return (
    <Modal
      open={open}
      onClose={() => st.openModal(null)}
      title="AI keys"
      description="Requests go straight from your browser to the provider. No server of ours is involved."
      width="max-w-xl"
      footer={
        <>
          <Button variant="danger" onClick={() => { st.clearAllKeys(); st.toast('All keys removed from this browser.'); }}>
            Remove all keys
          </Button>
          <Button variant="primary" onClick={() => st.openModal(null)}>Done</Button>
        </>
      }
    >
      <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        Keys are stored unencrypted in this browser&apos;s localStorage. Use keys with spending limits and avoid shared computers.
      </div>
      <div className="space-y-3">
        {ai.providers.map((p, i) => {
          const info = PROVIDER_INFO[p.id];
          return (
            <div key={p.id} className="rounded border border-rule p-3" data-testid={`provider-${p.id}`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-chrome px-1.5 py-0.5 font-mono text-[11px]">#{i + 1}</span>
                  <strong className="text-[13px]">{info.label}</strong>
                </div>
                <div className="flex items-center gap-1">
                  <Checkbox checked={p.enabled} onChange={(v) => st.setProvider(p.id, { enabled: v })}>Enabled</Checkbox>
                  <Button size="sm" variant="ghost" aria-label={`Move ${info.label} up`} disabled={i === 0} onClick={() => st.moveProvider(p.id, -1)}>↑</Button>
                  <Button size="sm" variant="ghost" aria-label={`Move ${info.label} down`} disabled={i === ai.providers.length - 1} onClick={() => st.moveProvider(p.id, 1)}>↓</Button>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_170px] gap-2">
                <div className="flex gap-1">
                  <input
                    aria-label={`${info.label} API key`}
                    className="field font-mono"
                    type={show[p.id] ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={info.keyHint}
                    value={p.apiKey}
                    onChange={(e) => st.setProvider(p.id, { apiKey: e.target.value.trim() })}
                  />
                  <Button size="sm" onClick={() => setShow((s) => ({ ...s, [p.id]: !s[p.id] }))}>{show[p.id] ? 'Hide' : 'Show'}</Button>
                </div>
                <div>
                  <input aria-label={`${info.label} model`} className="field" list={`models-${p.id}`} value={p.model} onChange={(e) => st.setProvider(p.id, { model: e.target.value })} />
                  <datalist id={`models-${p.id}`}>
                    {info.models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <Checkbox checked={ai.autoSwitch} onChange={st.setAutoSwitch}>
          Auto-switch to the next provider when one fails or hits a limit
        </Checkbox>
        <p className="mt-1 text-[12px] text-ink-soft">Order above is the priority. Model names are free text — use any model your key can access.</p>
      </div>
    </Modal>
  );
}
