import { createDefaultTable } from '@/core/engine/defaults';
import { matrixToTable, normalizeSchema } from '@/core/engine/schemaUtil';
import type { CellRange, TableSchema } from '@/types/schema';
import { readXlsx } from './xlsxReader';

/** RFC 4180 CSV parser with delimiter auto-detection. */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length > 1 && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',', ';', '\t'].map((d) => [d, sample.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Parses the first GitHub-flavoured Markdown pipe table found in the text. */
export function parseMarkdownTable(text: string): string[][] | null {
  const lines = text.split(/\r?\n/);
  const splitRow = (line: string): string[] => {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells: string[] = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\' && s[i + 1] === '|') {
        cur += '|';
        i++;
      } else if (s[i] === '|') {
        cells.push(cur.trim());
        cur = '';
      } else cur += s[i];
    }
    cells.push(cur.trim());
    return cells.map((c) => c.replace(/<br\s*\/?>/gi, '\n'));
  };
  const isSep = (l: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes('|') && isSep(lines[i + 1])) {
      const rows = [splitRow(lines[i])];
      for (let j = i + 2; j < lines.length && lines[j].includes('|'); j++) rows.push(splitRow(lines[j]));
      const width = Math.max(...rows.map((r) => r.length));
      return rows.map((r) => Array.from({ length: width }, (_, c) => r[c] ?? ''));
    }
  }
  return null;
}

export function parseJsonText(text: string, fallbackTitle: string): TableSchema {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (data?.format === 'table-maker' && data.document) return normalizeSchema(data.document);
  if (data && typeof data === 'object' && !Array.isArray(data) && data.cells) return normalizeSchema(data);
  if (Array.isArray(data) && data.length) {
    if (Array.isArray(data[0])) return matrixToTable(data.map((r: unknown[]) => r.map((v) => (v == null ? '' : String(v)))), fallbackTitle);
    if (typeof data[0] === 'object' && data[0] !== null) {
      const keys: string[] = [];
      for (const row of data) for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
      const matrix = [keys, ...data.map((row: Record<string, unknown>) => keys.map((k) => (row[k] == null ? '' : typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k]))))];
      return matrixToTable(matrix, fallbackTitle);
    }
  }
  throw new Error('Unsupported JSON structure. Use a Table Maker export, an array of rows, or an array of objects.');
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '') || 'Imported table';

export async function importFile(file: File): Promise<TableSchema> {
  const name = file.name.toLowerCase();
  const title = baseName(file.name);
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    const data = readXlsx(new Uint8Array(await file.arrayBuffer()));
    const doc = matrixToTable(data.matrix, data.title || title);
    doc.title = title;
    const merges: CellRange[] = data.merges.filter((m) => m.r2 < doc.rows.length && m.c2 < doc.columns.length);
    doc.mergedRanges = merges;
    data.colWidths.forEach((w, i) => {
      if (w && doc.columns[i]) doc.columns[i].width = Math.min(400, Math.max(40, w));
    });
    return doc;
  }
  const text = await file.text();
  if (name.endsWith('.json')) return parseJsonText(text, title);
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    const m = parseMarkdownTable(text);
    if (!m) throw new Error('No Markdown table found in this file.');
    return matrixToTable(m, title);
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return matrixToTable(parseCsv(text, name.endsWith('.tsv') ? '\t' : undefined), title);
  }
  throw new Error('Unsupported file type. Import CSV, TSV, XLSX, JSON or Markdown.');
}

export { createDefaultTable };
