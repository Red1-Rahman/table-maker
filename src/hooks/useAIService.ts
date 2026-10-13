import { completeWithFallback, usableProviders } from '@/core/ai/client';
import { SYSTEM_PROMPT, buildUserPrompt, parseAIResponse } from '@/core/ai/prompt';
import { useStore } from '@/store/tableStore';
import { useCallback, useRef } from 'react';

export function useAIService() {
  const busy = useStore((s) => s.aiBusy);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (instruction: string) => {
    const st = useStore.getState();
    const text = instruction.trim();
    if (!text || st.aiBusy) return;
    if (usableProviders(st.ai).length === 0) {
      st.openModal('keys');
      st.toast('Add an API key first.');
      return;
    }
    st.pushAiLog('user', text);
    st.setAiBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { prompt, truncated } = buildUserPrompt(text, st.doc, st.selectionRange());
      const out = await completeWithFallback(st.ai, { system: SYSTEM_PROMPT, prompt }, ctrl.signal);
      const result = parseAIResponse(out.text);
      const applied = result.table ? useStore.getState().applyAI(result) : false;
      const note = out.attempts.length ? ` (switched provider after: ${out.attempts.map((a) => a.provider).join(', ')})` : '';
      const warn = truncated ? ' Note: only the first rows were sent to the model.' : '';
      st.pushAiLog('assistant', `${result.message}${applied ? ' — applied, press Ctrl/Cmd+Z to undo.' : ''}${note}${warn}`);
    } catch (e) {
      if (ctrl.signal.aborted) st.pushAiLog('error', 'Cancelled.');
      else st.pushAiLog('error', e instanceof Error ? e.message : String(e));
    } finally {
      useStore.getState().setAiBusy(false);
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  return { run, cancel, busy };
}
