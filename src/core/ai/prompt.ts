import { cellToA1, parseRange, rangeToA1 } from '@/core/engine/address';
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from '@/core/engine/defaults';
import { MAX_COLS, MAX_ROWS, inferType, mergeRange } from '@/core/engine/gridMatrix';
import { type AICell, type AIResult } from '@/types/ai';
import { type CellData, type CellRange, type TableSchema, cellKey } from '@/types/schema';
import { safeColor } from '@/utils/sanitization';

export const MAX_AI_CELLS = 2500;

export const SYSTEM_PROMPT = `You are the editing engine of "Table Maker", a table design app.
You receive the current table as JSON and an instruction. Reply with ONE JSON object and nothing else (no markdown fences):
{
  "message": "one or two sentences describing what you did",
  "table": {
    "rows": [[cell, ...], ...],
    "merges": ["A1:B1"],
    "columnWidths": [140, 120]
  }
}
Rules:
- "table" is the COMPLETE new table (every row, every column). Omit "table" only if the instruction needs no change (answer in "message").
- A cell is a string/number, or an object {"v": value, "bold": bool, "italic": bool, "underline": bool, "color": "#rrggbb", "bg": "#rrggbb", "align": "left|center|right"}.
- Keep existing content, formatting and formulas unless the instruction says otherwise. Cells given as {"image": true} are images: return them unchanged in the same position.
- Formulas start with "=" and may use SUM, AVERAGE, MIN, MAX, COUNT, CONCAT, IF, ROUND with A1 references (row 1 = first row).
- To highlight, use "bg" and/or "color". Dates use YYYY-MM-DD.
- Never invent facts you are not confident about; if data is missing and you cannot know it, leave the cell empty and say so in "message".
- Output valid JSON only.`;

interface SerialCell {
  v?: string;
  image?: true;
  bold?: true;
  italic?: true;
  underline?: true;
  color?: string;
  bg?: string;
  align?: string;
}

export function serializeTable(doc: TableSchema, selection?: CellRange): { json: string; truncated: boolean } {
  const rows: (string | SerialCell)[][] = [];
  let truncated = false;
  const maxRows = Math.min(doc.rows.length, Math.max(1, Math.floor(MAX_AI_CELLS / Math.max(1, doc.columns.length))));
  if (maxRows < doc.rows.length) truncated = true;
  for (let r = 0; r < maxRows; r++) {
    const row: (string | SerialCell)[] = [];
    for (let c = 0; c < doc.columns.length; c++) {
      const cell = doc.cells[cellKey(r, c)];
      if (!cell) {
        row.push('');
        continue;
      }
      if (cell.type === 'image') {
        row.push({ image: true });
        continue;
      }
      const s = cell.style;
      if (s && (s.bold || s.italic || s.underline || s.color || s.bg || s.align)) {
        const o: SerialCell = { v: cell.value };
        if (s.bold) o.bold = true;
        if (s.italic) o.italic = true;
        if (s.underline) o.underline = true;
        if (s.color) o.color = s.color;
        if (s.bg) o.bg = s.bg;
        if (s.align) o.align = s.align;
        row.push(o);
      } else row.push(cell.value);
    }
    rows.push(row);
  }
  const payload = {
    headerRows: doc.styles.headerRows,
    rowCount: doc.rows.length,
    columnCount: doc.columns.length,
    selection: selection ? rangeToA1(selection) : undefined,
    merges: doc.mergedRanges.map(rangeToA1),
    rows,
  };
  return { json: JSON.stringify(payload), truncated };
}

export function buildUserPrompt(instruction: string, doc: TableSchema, selection?: CellRange) {
  const { json, truncated } = serializeTable(doc, selection);
  return {
    prompt: `Current table (JSON):\n${json}\n\nInstruction: ${instruction}`,
    truncated,
  };
}

/** Extracts and validates the JSON object from a model reply (tolerates code fences / prose). */
export function parseAIResponse(text: string): AIResult {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  let obj: any;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('The model returned malformed JSON.');
  }
  if (typeof obj !== 'object' || obj === null) throw new Error('Unexpected AI response.');
  const result: AIResult = { message: typeof obj.message === 'string' ? obj.message : 'Done.' };
  if (obj.table) {
    if (!Array.isArray(obj.table.rows) || !obj.table.rows.every(Array.isArray)) throw new Error('AI table must be an array of rows.');
    result.table = {
      rows: obj.table.rows,
      merges: Array.isArray(obj.table.merges) ? obj.table.merges.filter((m: unknown) => typeof m === 'string') : undefined,
      columnWidths: Array.isArray(obj.table.columnWidths) ? obj.table.columnWidths.filter((n: unknown) => typeof n === 'number') : undefined,
    };
  }
  return result;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Applies an AI table replacement to an (Immer draft) document. Returns a summary. */
export function applyAIResult(doc: TableSchema, result: AIResult): { changed: boolean } {
  const t = result.table;
  if (!t) return { changed: false };
  const rowsIn = t.rows.slice(0, MAX_ROWS);
  const nRows = Math.max(1, rowsIn.length);
  const nCols = Math.min(MAX_COLS, Math.max(1, ...rowsIn.map((r) => r.length)));
  const old = doc.cells;
  const cells: Record<string, CellData> = {};
  rowsIn.forEach((row, r) => {
    for (let c = 0; c < nCols; c++) {
      const raw: AICell | undefined = row[c];
      if (raw && typeof raw === 'object' && raw.image) {
        const prev = old[cellKey(r, c)];
        if (prev?.type === 'image') cells[cellKey(r, c)] = prev;
        continue;
      }
      const value = raw && typeof raw === 'object' ? str(raw.v) : str(raw);
      const style: NonNullable<CellData['style']> = {};
      if (raw && typeof raw === 'object') {
        if (raw.bold) style.bold = true;
        if (raw.italic) style.italic = true;
        if (raw.underline) style.underline = true;
        const color = safeColor(raw.color);
        const bg = safeColor(raw.bg);
        if (color) style.color = color;
        if (bg) style.bg = bg;
        if (raw.align === 'left' || raw.align === 'center' || raw.align === 'right') style.align = raw.align;
      } else {
        // keep prior formatting where the model returned a bare value
        const prev = old[cellKey(r, c)]?.style;
        if (prev) Object.assign(style, prev);
      }
      if (value === '' && !Object.keys(style).length) continue;
      const cell: CellData = { value, type: inferType(value) };
      if (Object.keys(style).length) cell.style = style;
      cells[cellKey(r, c)] = cell;
    }
  });
  doc.cells = cells;
  while (doc.rows.length < nRows) doc.rows.push({ height: DEFAULT_ROW_HEIGHT });
  doc.rows.length = nRows;
  while (doc.columns.length < nCols) doc.columns.push({ width: DEFAULT_COL_WIDTH });
  doc.columns.length = nCols;
  if (t.columnWidths) t.columnWidths.slice(0, nCols).forEach((w, i) => {
    doc.columns[i].width = Math.min(600, Math.max(40, w));
  });
  doc.dimensions.rows = nRows;
  doc.dimensions.columns = nCols;
  doc.mergedRanges = [];
  doc.borders = {};
  doc.validations = [];
  doc.conditionalRules = doc.conditionalRules.filter((r) => r.range.r2 < nRows && r.range.c2 < nCols);
  doc.filters = doc.filters.filter((f) => f.col < nCols);
  for (const m of t.merges ?? []) {
    const rg = parseRange(m);
    if (rg && rg.r2 < nRows && rg.c2 < nCols) mergeRange(doc, rg);
  }
  doc.frozen.rows = Math.min(doc.frozen.rows, nRows - 1);
  doc.frozen.cols = Math.min(doc.frozen.cols, nCols - 1);
  void cellToA1;
  return { changed: true };
}
