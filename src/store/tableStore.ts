import { create } from 'zustand';
import { type AISlice, createAISlice } from './slices/aiSlice';
import { type CanvasSlice, createCanvasSlice } from './slices/canvasSlice';
import { type GridSlice, createGridSlice } from './slices/gridSlice';
import { type UiSlice, createUiSlice } from './slices/uiSlice';

export type Store = GridSlice & CanvasSlice & AISlice & UiSlice;

export const useStore = create<Store>()((...a) => ({
  ...createGridSlice(...a),
  ...createCanvasSlice(...a),
  ...createAISlice(...a),
  ...createUiSlice(...a),
}));
