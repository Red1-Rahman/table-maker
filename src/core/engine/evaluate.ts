import type { TableSchema } from '@/types/schema';
import { cellKey } from '@/types/schema';
import { createEvaluator, toStr, type EvalContext, type Scalar, FormulaErr } from './formulaEngine';

const cache = new WeakMap<object, EvalContext>();

/** Evaluator memoised per immutable `cells` object, so edits invalidate automatically. */
export function getEvaluator(doc: Pick<TableSchema, 'cells'>): EvalContext {
  let ev = cache.get(doc.cells);
  if (!ev) {
    const cells = doc.cells;
    ev = createEvaluator((r, c) => cells[cellKey(r, c)]?.value);
    cache.set(doc.cells, ev);
  }
  return ev;
}

export const cellValue = (doc: Pick<TableSchema, 'cells'>, r: number, c: number): Scalar => getEvaluator(doc).get(r, c);

/** Text shown to the user: literals are shown as typed, formulas are evaluated and formatted. */
export function displayText(doc: Pick<TableSchema, 'cells'>, r: number, c: number): string {
  const cell = doc.cells[cellKey(r, c)];
  if (!cell || cell.type === 'image') return '';
  if (cell.value.startsWith('=') && cell.value.length > 1) return toStr(cellValue(doc, r, c));
  return cell.value;
}

export const isError = (v: Scalar): v is FormulaErr => v instanceof FormulaErr;

/** Numeric value of a cell if it is (or evaluates to) a number. */
export function numericValue(doc: Pick<TableSchema, 'cells'>, r: number, c: number): number | null {
  const v = cellValue(doc, r, c);
  if (typeof v === 'number') return v;
  return null;
}
