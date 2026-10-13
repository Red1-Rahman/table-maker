import { AIError, type AIAdapter, type AIRequest, type AISettings, type ProviderConfig, type ProviderId } from '@/types/ai';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { openaiAdapter } from './openai';

export const ADAPTERS: Record<ProviderId, AIAdapter> = {
  openai: openaiAdapter,
  gemini: geminiAdapter,
  anthropic: anthropicAdapter,
};

export const PROVIDER_INFO: Record<ProviderId, { label: string; models: string[]; keyHint: string }> = {
  openai: { label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'], keyHint: 'sk-…' },
  gemini: { label: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'], keyHint: 'AIza…' },
  anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5', 'claude-3-5-sonnet-latest', 'claude-3-haiku-20240307'], keyHint: 'sk-ant-…' },
};

export const PROVIDER_ORDER: ProviderId[] = ['openai', 'gemini', 'anthropic'];

export function defaultSettings(): AISettings {
  return {
    providers: PROVIDER_ORDER.map((id) => ({ id, apiKey: '', model: PROVIDER_INFO[id].models[0], enabled: true })),
    autoSwitch: true,
    activeProvider: null,
  };
}

export const usableProviders = (s: AISettings): ProviderConfig[] => s.providers.filter((p) => p.enabled && p.apiKey.trim() !== '');

export interface CompleteOutcome {
  text: string;
  provider: ProviderId;
  attempts: { provider: ProviderId; error: string }[];
}

/** Sends a request to the preferred provider; on failure optionally falls through to the next configured one. */
export async function completeWithFallback(settings: AISettings, req: AIRequest, signal?: AbortSignal): Promise<CompleteOutcome> {
  const list = usableProviders(settings);
  if (list.length === 0) throw new AIError('Add an API key in Settings → AI keys first.');
  const first = list.findIndex((p) => p.id === settings.activeProvider);
  const ordered = first > 0 ? [list[first], ...list.filter((_, i) => i !== first)] : list;
  const queue = settings.autoSwitch ? ordered : ordered.slice(0, 1);
  const attempts: CompleteOutcome['attempts'] = [];
  for (const cfg of queue) {
    try {
      const text = await ADAPTERS[cfg.id].complete(req, cfg, signal);
      return { text, provider: cfg.id, attempts };
    } catch (e) {
      if (signal?.aborted) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push({ provider: cfg.id, error: e instanceof TypeError ? `Network/CORS error (${msg})` : msg });
    }
  }
  const detail = attempts.map((a) => `${PROVIDER_INFO[a.provider].label}: ${a.error}`).join(' · ');
  throw new AIError(`AI request failed. ${detail}`);
}
