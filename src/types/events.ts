export type LogicalKey =
  | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
  | 'Enter' | 'Tab' | 'Escape' | 'Clear' | 'Home' | 'End' | 'PageUp' | 'PageDown' | 'F2'
  | 'Char' | 'Other';

export interface NormalizedKey {
  key: LogicalKey;
  char?: string; // printable character when key === 'Char'
  primary: boolean; // Cmd on macOS, Ctrl elsewhere
  shift: boolean;
  alt: boolean;
  /** lower-cased letter for shortcuts, e.g. "s" for Ctrl+S */
  letter?: string;
}

export interface CellAddress {
  r: number;
  c: number;
}

export interface Selection {
  anchor: CellAddress;
  focus: CellAddress;
}
