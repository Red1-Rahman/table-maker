/**
 * Core data contracts. Keep in sync with docs/contracts.md
 * (verified by `npm run check:contracts`).
 */

export type AspectRatioId = '1:sqrt2' | 'sqrt2:1' | '16:9' | '4:3' | '1:1' | 'custom';

/** growth: block growth beyond the page · autoscale: shrink content to fit · free: page grows in whole pages */
export type LockMode = 'growth' | 'autoscale' | 'free';

export type CellType = 'text' | 'number' | 'image' | 'boolean' | 'date';
export type ImageFitMode = 'contain' | 'cover' | 'stretch' | 'original' | 'center';
export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  bg?: string;
  fontFamily?: string;
  fontSize?: number;
  align?: HAlign;
  valign?: VAlign;
  wrap?: boolean;
  list?: 'bullet' | 'number';
  padding?: number;
}

export interface ImageConfig {
  src: string; // data: URL (compressed WebP/PNG, or SVG)
  fitMode: ImageFitMode;
  altText?: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface CellData {
  value: string; // raw string or formula e.g. "=SUM(A1:A5)"
  type: CellType;
  style?: CellStyle;
  imageConfig?: ImageConfig;
  comment?: string;
}

export interface CellRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface BorderSpec {
  width: number;
  style: LineStyle;
  color: string;
}

export interface ColumnMeta {
  width: number;
}
export interface RowMeta {
  height: number;
}

export interface TableGlobalStyles {
  themeId: string;
  zebra: boolean;
  headerRows: number;
  cellPadding: number;
  fontFamily: string;
  fontSize: number;
  gridColor: string;
  gridWidth: number;
  gridStyle: LineStyle | 'none';
}

export interface CanvasSettings {
  lockMode: LockMode;
  bg: string;
  margin: number; // px, page margin
  bleed: number; // px, bleed distance outside the page
}

export type ValidationType = 'text' | 'number' | 'select' | 'date' | 'email' | 'url' | 'checkbox';

export interface ValidationRule {
  id: string;
  range: CellRange;
  type: ValidationType;
  options?: string[]; // select
  min?: number;
  max?: number;
}

export type CondOp = 'gt' | 'lt' | 'eq' | 'contains' | 'between' | 'dateBetween' | 'colorScale' | 'dataBar';

export interface ConditionalRule {
  id: string;
  range: CellRange;
  op: CondOp;
  value?: string;
  value2?: string;
  style?: Pick<CellStyle, 'bg' | 'color' | 'bold'>;
  scale?: { min: string; max: string };
  barColor?: string;
}

export interface FilterRule {
  id: string;
  col: number;
  op: 'contains' | 'notContains' | 'eq' | 'gt' | 'lt' | 'between' | 'checked' | 'unchecked' | 'notEmpty';
  value?: string;
  value2?: string;
}

export interface TableSchema {
  id: string;
  title: string;
  version: string;
  aspectRatio: AspectRatioId;
  dimensions: {
    columns: number;
    rows: number;
    customWidthPx?: number;
    customHeightPx?: number;
  };
  styles: TableGlobalStyles;
  canvas: CanvasSettings;
  columns: ColumnMeta[];
  rows: RowMeta[];
  cells: Record<string, CellData>; // key: "rowIdx:colIdx"
  mergedRanges: CellRange[];
  /** Edge overrides. "h:r:c" = horizontal edge above row r at column c; "v:r:c" = vertical edge left of column c at row r. */
  borders: Record<string, BorderSpec>;
  conditionalRules: ConditionalRule[];
  validations: ValidationRule[];
  filters: FilterRule[];
  frozen: { rows: number; cols: number };
}

export const SCHEMA_VERSION = '1.0.0';

export const cellKey = (r: number, c: number): string => `${r}:${c}`;
export const parseKey = (k: string): [number, number] => {
  const i = k.indexOf(':');
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
};
