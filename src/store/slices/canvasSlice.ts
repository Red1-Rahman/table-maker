import type { StateCreator } from 'zustand';
import type { Store } from '../tableStore';

export interface CanvasSlice {
  zoom: number;
  showMargins: boolean;
  showBleed: boolean;
  showPageBreaks: boolean;
  showHeaders: boolean;
  snapToGrid: boolean;
  snapSize: number;
  fitRequest: number; // increment to request "fit to screen"
  setZoom: (z: number) => void;
  toggleView: (k: 'showMargins' | 'showBleed' | 'showPageBreaks' | 'showHeaders' | 'snapToGrid') => void;
  requestFit: () => void;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

export const createCanvasSlice: StateCreator<Store, [], [], CanvasSlice> = (set) => ({
  zoom: 1,
  showMargins: true,
  showBleed: false,
  showPageBreaks: true,
  showHeaders: true,
  snapToGrid: false,
  snapSize: 8,
  fitRequest: 0,
  setZoom: (z) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000)) }),
  toggleView: (k) => set((s) => ({ [k]: !s[k] }) as Partial<Store>),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
});
