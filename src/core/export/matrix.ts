import { displayText } from '@/core/engine/evaluate';
import { computeLayout } from '@/core/engine/layout';
import type { TableSchema } from '@/types/schema';
import { cellKey } from '@/types/schema';

export interface ExportMatrix {
  values: string[][];
  rowIndices: number[]; // original row index per exported row
  cols: number;
}

export function exportCellText(doc: TableSchema, r: number, c: number): string {
  const cell = doc.cells[cellKey(r, c)];
  if (!cell) return '';
  if (cell.type === 'image') return cell.imageConfig?.altText ?? '';
  return displayText(doc, r, c);
}

/** Visible (filter-aware) rows × columns, with trailing empty rows/columns trimmed. */
export function getExportMatrix(doc: TableSchema): ExportMatrix {
  const { hidden } = computeLayout(doc);
  const rowIndices: number[] = [];
  for (let r = 0; r < doc.rows.length; r++) if (!hidden.has(r)) rowIndices.push(r);
  let lastCol = 0;
  let lastRowPos = 0;
  rowIndices.forEach((r, pos) => {
    for (let c = 0; c < doc.columns.length; c++) {
      const cell = doc.cells[cellKey(r, c)];
      if (cell && (cell.value !== '' || cell.imageConfig)) {
        lastCol = Math.max(lastCol, c);
        lastRowPos = Math.max(lastRowPos, pos);
      }
    }
  });
  const rowsKept = rowIndices.slice(0, Math.max(lastRowPos + 1, Math.min(doc.styles.headerRows, rowIndices.length), 1));
  const cols = lastCol + 1;
  const values = rowsKept.map((r) => Array.from({ length: cols }, (_, c) => exportCellText(doc, r, c)));
  return { values, rowIndices: rowsKept, cols };
}
