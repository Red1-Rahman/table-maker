/**
 * Cross-platform key normalisation (FR-2.5).
 * - Cmd (macOS) and Ctrl (Windows/Linux) both map to a logical `primary` modifier.
 * - Backspace (0x08) and Delete (0x7f) both map to the logical `Clear` action.
 */
import type { LogicalKey, NormalizedKey } from '@/types/events';

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  keyCode?: number;
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
}

const MAP: Record<string, LogicalKey> = {
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  Enter: 'Enter', Tab: 'Tab', Escape: 'Escape', Esc: 'Escape',
  Backspace: 'Clear', Delete: 'Clear', Del: 'Clear',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', F2: 'F2',
};

export function normalizeKey(e: KeyLike, mac: boolean = isMac()): NormalizedKey {
  // Primary modifier: Cmd on macOS, Ctrl elsewhere. (Ctrl+Cmd combos are ignored.)
  const primary = mac ? !!e.metaKey : !!e.ctrlKey;
  let key: LogicalKey = MAP[e.key] ?? 'Other';
  if (key === 'Other' && (e.keyCode === 0x08 || e.keyCode === 0x7f)) key = 'Clear';
  const out: NormalizedKey = { key, primary, shift: !!e.shiftKey, alt: !!e.altKey };
  if (key === 'Other' && e.key.length === 1) {
    out.letter = e.key.toLowerCase();
    if (!primary && !e.ctrlKey && !e.metaKey && !e.altKey) {
      out.key = 'Char';
      out.char = e.key;
    }
  }
  return out;
}
