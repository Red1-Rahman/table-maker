import type { StateCreator } from 'zustand';
import type { Store } from '../tableStore';

export type ModalId = 'export' | 'keys' | 'import' | 'templates' | 'help' | 'newTable' | null;
export type InspectorTab = 'table' | 'cell' | 'rules';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

export interface CtxMenu {
  x: number;
  y: number;
  kind: 'cell' | 'row' | 'col';
  r: number;
  c: number;
}

export interface UiSlice {
  ctxMenu: CtxMenu | null;
  setCtxMenu: (m: CtxMenu | null) => void;
  modal: ModalId;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  aiBarOpen: boolean;
  autoSizeImages: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  toasts: Toast[];
  openModal: (m: ModalId) => void;
  setInspector: (open: boolean, tab?: InspectorTab) => void;
  setAiBarOpen: (o: boolean) => void;
  setAutoSizeImages: (b: boolean) => void;
  setSaveState: (s: UiSlice['saveState']) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const createUiSlice: StateCreator<Store, [], [], UiSlice> = (set, get) => ({
  ctxMenu: null,
  setCtxMenu: (ctxMenu) => set({ ctxMenu }),
  modal: null,
  inspectorOpen: true,
  inspectorTab: 'table',
  aiBarOpen: false,
  autoSizeImages: true,
  saveState: 'idle',
  toasts: [],
  openModal: (modal) => set({ modal }),
  setInspector: (inspectorOpen, tab) => set((s) => ({ inspectorOpen, inspectorTab: tab ?? s.inspectorTab })),
  setAiBarOpen: (aiBarOpen) => set({ aiBarOpen }),
  setAutoSizeImages: (autoSizeImages) => set({ autoSizeImages }),
  setSaveState: (saveState) => set({ saveState }),
  toast: (text, kind = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    if (typeof setTimeout !== 'undefined') setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
});
