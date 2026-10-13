/**
 * Resolves the final visual state of a cell: theme + zebra + cell style + conditional formatting.
 * Shared by the DOM grid, the canvas painter (PNG) and the PDF painter.
 */
import type { CellRange, CellStyle, HAlign, ImageConfig, TableSchema, VAlign } from '@/types/schema';
import { cellKey } from '@/types/schema';
import { rangeContains } from './address';
import { cellValue, displayText } from './evaluate';
import { FormulaErr, type Scalar } from './formulaEngine';
import { getTheme } from './themes';

export interface ResolvedStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  bg: string;
  fontFamily: string;
  fontSize: number;
  align: HAlign;
  valign: VAlign;
  wrap: boolean;
  list?: 'bullet' | 'number';
  padding: number;
}

export interface ResolvedCell {
  r: number;
  c: number;
  text: string;
  kind: 'text' | 'image' | 'checkbox';
  checked: boolean;
  image?: ImageConfig;
  style: ResolvedStyle;
  bar?: { frac: number; color: string };
}

// ------------------------------------------------------------------ colours

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Readable text colour (black/white) for a background. */
export function contrastText(bg: string): string {
  const [r, g, b] = hexToRgb(bg);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff';
}

// --------------------------------------------------------- range statistics

const statCache = new WeakMap<object, Map<string, { min: number; max: number }>>();

function rangeStats(doc: TableSchema, id: string, rg: CellRange): { min: number; max: number } {
  let perDoc = statCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    statCache.set(doc, perDoc);
  }
  const hit = perDoc.get(id);
  if (hit) return hit;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let r = rg.r1; r <= rg.r2; r++)
    for (let c = rg.c1; c <= rg.c2; c++) {
      const v = cellValue(doc, r, c);
      if (typeof v === 'number') {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
  const res = Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
  perDoc.set(id, res);
  return res;
}

// -------------------------------------------------------- conditional rules

interface CondResult {
  bg?: string;
  color?: string;
  bold?: boolean;
  bar?: { frac: number; color: string };
}

function asNumber(v: Scalar): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function evalConditional(doc: TableSchema, r: number, c: number): CondResult {
  const out: CondResult = {};
  if (doc.conditionalRules.length === 0) return out;
  const value = cellValue(doc, r, c);
  if (value instanceof FormulaErr) return out;
  const num = asNumber(value);
  const text = displayText(doc, r, c).toLowerCase();
  for (const rule of doc.conditionalRules) {
    if (!rangeContains(rule.range, r, c)) continue;
    let hit = false;
    const v1 = rule.value ?? '';
    switch (rule.op) {
      case 'gt':
        hit = num !== null && v1 !== '' && num > Number(v1);
        break;
      case 'lt':
        hit = num !== null && v1 !== '' && num < Number(v1);
        break;
      case 'eq':
        hit = num !== null && v1.trim() !== '' && !Number.isNaN(Number(v1)) ? num === Number(v1) : text === v1.toLowerCase();
        break;
      case 'contains':
        hit = v1 !== '' && text.includes(v1.toLowerCase());
        break;
      case 'between':
        hit = num !== null && num >= Number(v1) && num <= Number(rule.value2 ?? v1);
        break;
      case 'dateBetween': {
        const t = Date.parse(text);
        hit = !Number.isNaN(t) && t >= Date.parse(v1) && t <= Date.parse(rule.value2 ?? v1);
        break;
      }
      case 'colorScale': {
        if (num === null) break;
        const { min, max } = rangeStats(doc, rule.id, rule.range);
        const t = max === min ? 0.5 : (num - min) / (max - min);
        out.bg = mix(rule.scale?.min ?? '#ffffff', rule.scale?.max ?? '#2f5bea', t);
        out.color = contrastText(out.bg);
        break;
      }
      case 'dataBar': {
        if (num === null) break;
        const { min, max } = rangeStats(doc, rule.id, rule.range);
        const lo = Math.min(0, min);
        const frac = max === lo ? 0 : (num - lo) / (max - lo);
        out.bar = { frac: Math.max(0, Math.min(1, frac)), color: rule.barColor ?? '#9db4f7' };
        break;
      }
    }
    if (hit && rule.style) {
      if (rule.style.bg) out.bg = rule.style.bg;
      if (rule.style.color) out.color = rule.style.color;
      if (rule.style.bold) out.bold = true;
    }
  }
  return out;
}

// ------------------------------------------------------------- final style

export function resolveStyle(doc: TableSchema, r: number, c: number, value?: Scalar): ResolvedStyle {
  const theme = getTheme(doc.styles.themeId);
  const isHeader = r < doc.styles.headerRows;
  const cs: CellStyle = doc.cells[cellKey(r, c)]?.style ?? {};
  const cond = evalConditional(doc, r, c);
  let bg = theme.bg;
  let color = theme.text;
  if (isHeader) {
    bg = theme.headerBg;
    color = theme.headerText;
  } else if (doc.styles.zebra && (r - doc.styles.headerRows) % 2 === 1) {
    bg = theme.zebraBg;
  }
  const v = value ?? cellValue(doc, r, c);
  const isNum = typeof v === 'number';
  return {
    bold: cond.bold ?? cs.bold ?? isHeader,
    italic: cs.italic ?? false,
    underline: cs.underline ?? false,
    strike: cs.strike ?? false,
    color: cs.color ?? cond.color ?? color,
    bg: cs.bg ?? cond.bg ?? bg,
    fontFamily: cs.fontFamily ?? doc.styles.fontFamily,
    fontSize: cs.fontSize ?? doc.styles.fontSize,
    align: cs.align ?? (isNum ? 'right' : 'left'),
    valign: cs.valign ?? 'middle',
    wrap: cs.wrap ?? true,
    list: cs.list,
    padding: cs.padding ?? doc.styles.cellPadding,
  };
}

export function resolveCell(doc: TableSchema, r: number, c: number): ResolvedCell {
  const cell = doc.cells[cellKey(r, c)];
  const value = cellValue(doc, r, c);
  const style = resolveStyle(doc, r, c, value);
  const cond = evalConditional(doc, r, c);
  const base = { r, c, style, bar: cond.bar };
  if (cell?.type === 'image' && cell.imageConfig) {
    return { ...base, text: '', kind: 'image', checked: false, image: cell.imageConfig };
  }
  if (cell?.type === 'boolean') {
    return { ...base, text: '', kind: 'checkbox', checked: /^true$/i.test(cell.value.trim()) };
  }
  return { ...base, text: displayText(doc, r, c), kind: 'text', checked: false };
}

export function gridLineColor(doc: TableSchema): string {
  return doc.styles.gridColor || getTheme(doc.styles.themeId).grid;
}
