import { usableProviders } from '@/core/ai/client';
import { PROVIDER_INFO } from '@/core/ai/client';
import { useAIService } from '@/hooks/useAIService';
import { useStore } from '@/store/tableStore';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../common/Button';

const EXAMPLES = [
  'Highlight all cells with values over 1000 in green',
  'Fix spelling errors and standardise dates to YYYY-MM-DD',
  'Generate a table comparing the top 5 Linux distributions for gaming',
  'Fill missing data in column C',
];

/** Prompt-driven table editing. Results are applied as one undoable step. */
export function AIPromptBar() {
  const open = useStore((s) => s.aiBarOpen);
  const log = useStore((s) => s.aiLog);
  const ai = useStore((s) => s.ai);
  const { run, cancel, busy } = useAIService();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log.length]);
  if (!open) return null;
  const providers = usableProviders(ai);
  const submit = () => {
    if (!text.trim()) return;
    run(text);
    setText('');
  };
  return (
    <section className="border-t border-rule bg-white" aria-label="AI assistant">
      {log.length > 0 && (
        <div ref={logRef} className="max-h-36 overflow-y-auto border-b border-rule px-3 py-2 text-[12px]" data-testid="ai-log">
          {log.map((m, i) => (
            <p key={i} className={`mb-1 ${m.role === 'user' ? 'font-medium text-ink' : m.role === 'error' ? 'text-red-700' : 'text-ink-soft'}`}>
              <span className="mr-1 font-mono text-[10px] opacity-70">{m.role === 'user' ? 'you' : m.role === 'error' ? 'error' : 'ai'}</span>
              {m.text}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-accent">✦</span>
        <input
          ref={inputRef}
          aria-label="AI instruction"
          className="field flex-1"
          placeholder={providers.length ? 'Describe what to do with the table…' : 'Add an API key to use AI editing →'}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') useStore.getState().setAiBarOpen(false);
          }}
        />
        {busy ? (
          <Button onClick={cancel}>Cancel</Button>
        ) : (
          <Button variant="primary" onClick={submit} disabled={!text.trim()}>
            Run
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => useStore.getState().openModal('keys')} title={providers.length ? `Using ${PROVIDER_INFO[providers[0].id].label}${ai.autoSwitch ? ' (+fallback)' : ''}` : 'Add key'}>
          {providers.length ? PROVIDER_INFO[providers[0].id].label : 'Add key'}
        </Button>
        <Button variant="ghost" size="sm" aria-label="Close AI bar" onClick={() => useStore.getState().setAiBarOpen(false)}>✕</Button>
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="rounded-full border border-rule px-2.5 py-0.5 text-[11px] text-ink-soft hover:bg-accent-soft" onClick={() => setText(ex)}>
            {ex}
          </button>
        ))}
        <span className="text-[11px] text-ink-soft">The selection is sent as context. Undo with Ctrl/Cmd+Z.</span>
      </div>
    </section>
  );
}
