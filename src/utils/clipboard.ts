import { displayText } from '@/core/engine/evaluate';
import { escapeHtml, sanitizeHtml } from '@/utils/sanitization';
import { type CellRange, type TableSchema, cellKey } from '@/types/schema';
import { findMerge } from '@/core/engine/gridMatrix';

export function rangeMatrix(doc: TableSchema, rg: CellRange): string[][] {
  const out: string[][] = [];
  for (let r = rg.r1; r <= rg.r2; r++) {
    const row: string[] = [];
    for (let c = rg.c1; c <= rg.c2; c++) {
      const cell = doc.cells[cellKey(r, c)];
      row.push(cell?.type === 'image' ? (cell.imageConfig?.altText ?? '') : displayText(doc, r, c));
    }
    out.push(row);
  }
  return out;
}

const tsvEscape = (v: string) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const toTsv = (m: string[][]) => m.map((r) => r.map(tsvEscape).join('\t')).join('\n');

/** HTML table for Excel / Sheets / Word / Notion paste targets. */
export function toClipboardHtml(doc: TableSchema, rg: CellRange): string {
  const m = rangeMatrix(doc, rg);
  const rows = m.map((row, i) => {
    const r = rg.r1 + i;
    const tds = row.map((v, j) => {
      const c = rg.c1 + j;
      const merge = findMerge(doc, r, c);
      if (merge && (merge.r1 !== r || merge.c1 !== c)) return '';
      const st = doc.cells[cellKey(r, c)]?.style;
      const css = [st?.bold && 'font-weight:700', st?.italic && 'font-style:italic', st?.color && `color:${st.color}`, st?.bg && `background:${st.bg}`].filter(Boolean).join(';');
      const span = merge ? ` colspan="${merge.c2 - merge.c1 + 1}" rowspan="${merge.r2 - merge.r1 + 1}"` : '';
      return `<td${span}${css ? ` style="${css}"` : ''}>${escapeHtml(v).replace(/\n/g, '<br>')}</td>`;
    });
    return `<tr>${tds.join('')}</tr>`;
  });
  return sanitizeHtml(`<table>${rows.join('')}</table>`);
}

/** Parses TSV text (with quoted multi-line fields). */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const t = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === '\t') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** Extracts a table from pasted HTML if present, otherwise falls back to TSV text. */
export function parseClipboard(text: string, html: string): string[][] {
  if (html && /<table/i.test(html) && typeof DOMParser !== 'undefined') {
    const clean = sanitizeHtml(html);
    const dom = new DOMParser().parseFromString(clean, 'text/html');
    const table = dom.querySelector('table');
    if (table) {
      const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td,th')).map((td) => {
          td.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
          return (td.textContent ?? '').replace(/\u00a0/g, ' ').trim();
        }),
      );
      if (rows.length) return rows;
    }
  }
  return parseTsv(text);
}
