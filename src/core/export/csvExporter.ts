import type { TableSchema } from '@/types/schema';
import { getExportMatrix } from './matrix';

export function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function matrixToCsv(values: string[][], delimiter = ','): string {
  return values.map((row) => row.map(csvEscape).join(delimiter)).join('\r\n');
}

/** UTF-8 with BOM so Excel opens non-Latin text correctly. */
export function exportCsv(doc: TableSchema): string {
  return `\uFEFF${matrixToCsv(getExportMatrix(doc).values)}\r\n`;
}
