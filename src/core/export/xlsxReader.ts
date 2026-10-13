/** Reads the first worksheet of an .xlsx file into a string matrix (values, shared strings, simple dates). */
import { lettersToCol } from '@/core/engine/address';
import type { CellRange } from '@/types/schema';
import { strFromU8, unzipSync } from 'fflate';

export interface XlsxData {
  matrix: string[][];
  merges: CellRange[];
  colWidths: (number | undefined)[]; // px
  title: string;
}

const DATE_FMT_IDS = new Set([14, 15, 16, 17, 22]);

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XLSX XML');
  return doc;
}

const textOf = (el: Element | null | undefined): string => {
  if (!el) return '';
  const parts: string[] = [];
  for (const t of Array.from(el.getElementsByTagName('t'))) {
    // skip phonetic runs
    if (t.parentElement?.tagName === 'rPh') continue;
    parts.push(t.textContent ?? '');
  }
  return parts.join('');
};

function excelSerialToIso(n: number): string {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? String(n) : d.toISOString().slice(0, 10);
}

export function readXlsx(bytes: Uint8Array): XlsxData {
  const zip = unzipSync(bytes);
  const get = (name: string) => (zip[name] ? strFromU8(zip[name]) : null);
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  let sheetPath = 'xl/worksheets/sheet1.xml';
  let title = 'Imported workbook';
  if (wb && rels) {
    const wbDoc = parseXml(wb);
    const sheet = wbDoc.getElementsByTagName('sheet')[0];
    if (sheet) {
      title = sheet.getAttribute('name') ?? title;
      const rid = sheet.getAttribute('r:id') ?? sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      for (const rel of Array.from(parseXml(rels).getElementsByTagName('Relationship'))) {
        if (rel.getAttribute('Id') === rid) {
          const target = rel.getAttribute('Target') ?? '';
          sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
        }
      }
    }
  }
  const sheetXml = get(sheetPath) ?? get('xl/worksheets/sheet1.xml');
  if (!sheetXml) throw new Error('No worksheet found in this XLSX file.');

  const shared: string[] = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) for (const si of Array.from(parseXml(sst).getElementsByTagName('si'))) shared.push(textOf(si));

  // date styles
  const dateXf = new Set<number>();
  const stylesXml = get('xl/styles.xml');
  if (stylesXml) {
    const sd = parseXml(stylesXml);
    const customDate = new Set<number>();
    for (const nf of Array.from(sd.getElementsByTagName('numFmt'))) {
      const code = (nf.getAttribute('formatCode') ?? '').toLowerCase().replace(/\[[^\]]*\]|"[^"]*"/g, '');
      if (/[ymd]/.test(code) && !/[hs]/.test(code.replace(/mm/g, ''))) customDate.add(Number(nf.getAttribute('numFmtId')));
    }
    const xfsEl = sd.getElementsByTagName('cellXfs')[0];
    if (xfsEl)
      Array.from(xfsEl.getElementsByTagName('xf')).forEach((xf, i) => {
        const id = Number(xf.getAttribute('numFmtId'));
        if (DATE_FMT_IDS.has(id) || customDate.has(id)) dateXf.add(i);
      });
  }

  const sd = parseXml(sheetXml);
  const matrix: string[][] = [];
  let maxCols = 0;
  for (const c of Array.from(sd.getElementsByTagName('c'))) {
    const ref = c.getAttribute('r') ?? '';
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) continue;
    const col = lettersToCol(m[1]);
    const row = Number(m[2]) - 1;
    if (row > 5000 || col > 500) continue;
    const t = c.getAttribute('t');
    const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
    let value = '';
    if (t === 's') value = shared[Number(v)] ?? '';
    else if (t === 'inlineStr') value = textOf(c.getElementsByTagName('is')[0]);
    else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
    else if (t === 'str' || t === 'e') value = v;
    else if (v !== '') {
      const s = Number(c.getAttribute('s') ?? -1);
      value = dateXf.has(s) && !Number.isNaN(Number(v)) ? excelSerialToIso(Number(v)) : v;
    }
    if (value === '') continue;
    while (matrix.length <= row) matrix.push([]);
    matrix[row][col] = value;
    maxCols = Math.max(maxCols, col + 1);
  }
  const rows = matrix.length;
  const full = Array.from({ length: rows }, (_, r) => Array.from({ length: maxCols }, (_, c) => matrix[r]?.[c] ?? ''));

  const merges: CellRange[] = [];
  for (const mc of Array.from(sd.getElementsByTagName('mergeCell'))) {
    const parts = (mc.getAttribute('ref') ?? '').split(':');
    const a = /^([A-Z]+)(\d+)$/.exec(parts[0] ?? '');
    const b = /^([A-Z]+)(\d+)$/.exec(parts[1] ?? '');
    if (a && b) merges.push({ r1: Number(a[2]) - 1, c1: lettersToCol(a[1]), r2: Number(b[2]) - 1, c2: lettersToCol(b[1]) });
  }
  const colWidths: (number | undefined)[] = [];
  for (const col of Array.from(sd.getElementsByTagName('col'))) {
    const min = Number(col.getAttribute('min'));
    const max = Math.min(Number(col.getAttribute('max')), 500);
    const w = Number(col.getAttribute('width'));
    if (w > 0) for (let i = min; i <= max; i++) colWidths[i - 1] = Math.round(w * 7);
  }
  return { matrix: full.length ? full : [['']], merges, colWidths, title };
}
