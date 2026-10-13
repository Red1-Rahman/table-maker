// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStarterTable } from '@/core/engine/defaults';
import { mergeRange, setCellValue, applyStyle } from '@/core/engine/gridMatrix';
import { exportCsv } from '@/core/export/csvExporter';
import { exportMarkdown } from '@/core/export/markdownExporter';
import { exportJson } from '@/core/export/jsonExporter';
import { exportHtml } from '@/core/export/htmlExporter';
import { exportXlsx } from '@/core/export/excelExporter';
import { readXlsx } from '@/core/export/xlsxReader';
import { exportPdf, needsRasterPdf } from '@/core/export/pdfExporter';
import { exportBatch } from '@/core/export/batchExporter';
import { parseCsv, parseJsonText, parseMarkdownTable } from '@/core/export/importers';
import { validateInput } from '@/core/engine/validation';
import { computeLayout } from '@/core/engine/layout';

const doc = () => {
  const d = createStarterTable();
  setCellValue(d, 1, 2, 'He said "hi", ok\nline2');
  return d;
};

describe('text exporters', () => {
  it('CSV quotes and evaluates formulas, adds BOM', () => {
    const csv = exportCsv(doc());
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"He said ""hi"", ok\nline2"');
    expect(csv).toContain('Average,,,9\r');
  });
  it('Markdown escapes pipes/newlines', () => {
    const d = doc();
    setCellValue(d, 2, 0, 'a|b');
    const md = exportMarkdown(d);
    expect(md.split('\n')[1]).toMatch(/^\| --- /);
    expect(md).toContain('a\\|b');
    expect(md).toContain('line2'.replace('line2', '<br>line2'));
  });
  it('JSON is lossless and re-importable', () => {
    const d = doc();
    const back = parseJsonText(exportJson(d), 'x');
    expect(back.cells['1:2'].value).toBe(d.cells['1:2'].value);
    expect(back.columns.length).toBe(d.columns.length);
  });
  it('HTML escapes content and keeps merges', () => {
    const d = doc();
    setCellValue(d, 3, 0, '<script>alert(1)</script>');
    mergeRange(d, { r1: 5, c1: 0, r2: 5, c2: 1 });
    const html = exportHtml(d);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('colspan="2"');
  });
  it('hidden (filtered) rows are skipped', () => {
    const d = doc();
    d.filters.push({ id: 'f', col: 0, op: 'contains', value: 'Nobara' });
    expect(computeLayout(d).hidden.size).toBeGreaterThan(0);
    const csv = exportCsv(d);
    expect(csv).toContain('Nobara');
    expect(csv).not.toContain('Bazzite');
  });
});

describe('import parsers', () => {
  it('CSV with quotes, CRLF, semicolons', () => {
    expect(parseCsv('a,b\r\n"x,1","y ""q"""\r\n')).toEqual([['a', 'b'], ['x,1', 'y "q"']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('Markdown table', () => {
    const m = parseMarkdownTable('intro\n\n| A | B |\n|---|:-:|\n| 1 | x\\|y |\n');
    expect(m).toEqual([['A', 'B'], ['1', 'x|y']]);
    expect(parseMarkdownTable('no table')).toBeNull();
  });
  it('JSON arrays of objects', () => {
    const d = parseJsonText('[{"n":"a","v":1},{"n":"b","v":2}]', 't');
    expect(d.cells['0:0'].value).toBe('n');
    expect(d.cells['2:1'].value).toBe('2');
    expect(() => parseJsonText('{', 't')).toThrow();
  });
  it('rejects unsafe image sources on import', () => {
    const d = doc();
    d.cells['0:0'] = { value: '', type: 'image', imageConfig: { src: 'https://evil/x.png', fitMode: 'contain' } };
    const back = parseJsonText(JSON.stringify(d), 't');
    expect(back.cells['0:0'].imageConfig).toBeUndefined();
  });
});

describe('xlsx round trip', () => {
  it('writes a valid zip that the reader understands', () => {
    const d = doc();
    applyStyle(d, { r1: 0, c1: 0, r2: 0, c2: 3 }, { bold: true });
    mergeRange(d, { r1: 7, c1: 0, r2: 7, c2: 1 });
    const bytes = exportXlsx(d);
    expect(bytes[0]).toBe(0x50); // PK
    const r = readXlsx(bytes);
    expect(r.matrix[0][0]).toBe('Distribution');
    expect(r.matrix[1][2]).toContain('line2');
    expect(r.matrix[6][3]).toBe('9');
    expect(r.merges.length).toBe(1);
  });
});

describe('pdf', () => {
  it('produces a vector PDF for Latin text', async () => {
    const d = doc();
    expect(needsRasterPdf(d)).toBe(false);
    const bytes = await exportPdf(d, { mode: 'vector' });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1500);
  });
  it('detects non-Latin text', () => {
    const d = doc();
    setCellValue(d, 2, 0, 'বাংলা');
    expect(needsRasterPdf(d)).toBe(true);
  });
  it('paginates in free mode', async () => {
    const d = doc();
    d.canvas.lockMode = 'free';
    for (let i = 0; i < 40; i++) d.rows.push({ height: 40 });
    d.dimensions.rows = d.rows.length;
    const bytes = await exportPdf(d, { mode: 'vector' });
    const text = new TextDecoder('latin1').decode(bytes);
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});

describe('batch', () => {
  it('zips multiple formats', async () => {
    const files = await exportBatch(doc(), { formats: ['csv', 'md', 'json', 'html', 'xlsx'], zip: true, baseName: 'My table', pixelRatio: 1 });
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('My-table.zip');
  });
  it('returns separate files without zip', async () => {
    const files = await exportBatch(doc(), { formats: ['csv', 'md'], zip: false, baseName: 't', pixelRatio: 1 });
    expect(files.map((f) => f.name)).toEqual(['t.csv', 't.md']);
  });
});

describe('validation', () => {
  it('enforces rule types', () => {
    const d = doc();
    d.validations.push({ id: 'n', range: { r1: 1, c1: 3, r2: 5, c2: 3 }, type: 'number', min: 0, max: 10 });
    d.validations.push({ id: 's', range: { r1: 1, c1: 1, r2: 1, c2: 1 }, type: 'select', options: ['A', 'B'] });
    d.validations.push({ id: 'e', range: { r1: 2, c1: 1, r2: 2, c2: 1 }, type: 'email' });
    expect(validateInput(d, 1, 3, '5').ok).toBe(true);
    expect(validateInput(d, 1, 3, '11').ok).toBe(false);
    expect(validateInput(d, 1, 3, 'abc').ok).toBe(false);
    expect(validateInput(d, 1, 1, 'C').ok).toBe(false);
    expect(validateInput(d, 2, 1, 'a@b.co').ok).toBe(true);
    expect(validateInput(d, 2, 1, 'nope').ok).toBe(false);
    expect(validateInput(d, 0, 0, 'anything').ok).toBe(true);
  });
});
