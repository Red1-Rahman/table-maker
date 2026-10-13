import { PROVIDER_INFO, PROVIDER_ORDER, defaultSettings } from '@/core/ai/client';
import type { AISettings, ProviderId } from '@/types/ai';
import type { StateCreator } from 'zustand';
import type { Store } from '../tableStore';

const LS_KEY = 'tablemaker.ai.v1';

function load(): AISettings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    const providers = PROVIDER_ORDER.map((id) => {
      const saved = parsed.providers?.find((p) => p.id === id);
      return { id, apiKey: saved?.apiKey ?? '', model: saved?.model || PROVIDER_INFO[id].models[0], enabled: saved?.enabled ?? true };
    });
    // keep the user's saved priority order
    const order = parsed.providers?.map((p) => p.id).filter((id): id is ProviderId => PROVIDER_ORDER.includes(id)) ?? PROVIDER_ORDER;
    providers.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return { providers, autoSwitch: parsed.autoSwitch ?? true, activeProvider: parsed.activeProvider ?? null };
  } catch {
    return base;
  }
}

export interface AISlice {
  ai: AISettings;
  aiBusy: boolean;
  aiLog: { role: 'user' | 'assistant' | 'error'; text: string }[];
  setProvider: (id: ProviderId, patch: Partial<{ apiKey: string; model: string; enabled: boolean }>) => void;
  moveProvider: (id: ProviderId, dir: -1 | 1) => void;
  setAutoSwitch: (v: boolean) => void;
  setActiveProvider: (id: ProviderId | null) => void;
  clearAllKeys: () => void;
  setAiBusy: (b: boolean) => void;
  pushAiLog: (role: 'user' | 'assistant' | 'error', text: string) => void;
  clearAiLog: () => void;
}

const persist = (ai: AISettings) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ai));
  } catch {
    /* storage unavailable */
  }
};

export const createAISlice: StateCreator<Store, [], [], AISlice> = (set, get) => ({
  ai: load(),
  aiBusy: false,
  aiLog: [],
  setProvider: (id, patch) => {
    const ai = { ...get().ai, providers: get().ai.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
    persist(ai);
    set({ ai });
  },
  moveProvider: (id, dir) => {
    const list = get().ai.providers.slice();
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const ai = { ...get().ai, providers: list };
    persist(ai);
    set({ ai });
  },
  setAutoSwitch: (v) => {
    const ai = { ...get().ai, autoSwitch: v };
    persist(ai);
    set({ ai });
  },
  setActiveProvider: (id) => {
    const ai = { ...get().ai, activeProvider: id };
    persist(ai);
    set({ ai });
  },
  clearAllKeys: () => {
    const ai = { ...get().ai, providers: get().ai.providers.map((p) => ({ ...p, apiKey: '' })) };
    persist(ai);
    set({ ai });
  },
  setAiBusy: (aiBusy) => set({ aiBusy }),
  pushAiLog: (role, text) => set((s) => ({ aiLog: [...s.aiLog.slice(-19), { role, text }] })),
  clearAiLog: () => set({ aiLog: [] }),
});
