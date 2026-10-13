import type { CellRange } from '@/types/schema';

export function colToLetters(c: number): string {
  let n = c + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function lettersToCol(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellToA1(r: number, c: number): string {
  return `${colToLetters(c)}${r + 1}`;
}

const A1_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)$/;

export function parseA1(a1: string): { r: number; c: number } | null {
  const m = A1_RE.exec(a1.trim());
  if (!m) return null;
  return { r: Number(m[2]) - 1, c: lettersToCol(m[1]) };
}

export function normRange(r1: number, c1: number, r2: number, c2: number): CellRange {
  return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
}

export function parseRange(text: string): CellRange | null {
  const parts = text.split(':');
  if (parts.length === 1) {
    const a = parseA1(parts[0]);
    return a ? normRange(a.r, a.c, a.r, a.c) : null;
  }
  if (parts.length !== 2) return null;
  const a = parseA1(parts[0]);
  const b = parseA1(parts[1]);
  if (!a || !b) return null;
  return normRange(a.r, a.c, b.r, b.c);
}

export function rangeToA1(rg: CellRange): string {
  const a = cellToA1(rg.r1, rg.c1);
  return rg.r1 === rg.r2 && rg.c1 === rg.c2 ? a : `${a}:${cellToA1(rg.r2, rg.c2)}`;
}

export const rangeContains = (rg: CellRange, r: number, c: number): boolean =>
  r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2;

export const rangesIntersect = (a: CellRange, b: CellRange): boolean =>
  a.r1 <= b.r2 && a.r2 >= b.r1 && a.c1 <= b.c2 && a.c2 >= b.c1;

export const rangeEquals = (a: CellRange, b: CellRange): boolean =>
  a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

export const rangeCells = (rg: CellRange): number => (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1);
