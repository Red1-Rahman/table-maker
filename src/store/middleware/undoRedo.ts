import type { Patch } from 'immer';

export interface HistoryEntry {
  patches: Patch[];
  inverse: Patch[];
}

export const HISTORY_LIMIT = 200;

export function pushHistory(past: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = past.length >= HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT + 1) : past.slice();
  next.push(entry);
  return next;
}
