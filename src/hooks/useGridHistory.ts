import { useStore } from '@/store/tableStore';

/** Undo/redo (Immer patch stack). */
export function useGridHistory() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  return { undo, redo, canUndo, canRedo };
}
