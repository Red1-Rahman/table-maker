/** Generates public/templates/*.json. Run with `npm run gen:templates`. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createDefaultTable } from '../src/core/engine/defaults';
import { inferType, mergeRange } from '../src/core/engine/gridMatrix';
import type { CellStyle, TableSchema } from '../src/types/schema';

const OUT = new URL('../public/templates/', import.meta.url);
mkdirSync(OUT, { recursive: true });

function put(d: TableSchema, r: number, c: number, v: string, style?: CellStyle) {
  d.cells[`${r}:${c}`] = { value: v, type: inferType(v), ...(style ? { style } : {}) };
}
function fill(d: TableSchema, rows: string[][], r0 = 0) {
  rows.forEach((row, i) => row.forEach((v, c) => v !== '' && put(d, r0 + i, c, v)));
}
function widths(d: TableSchema, w: number[]) {
  w.forEach((x, i) => {
    d.columns[i].width = x;
  });
}

const templates: { id: string; name: string; description: string; doc: TableSchema }[] = [];

// 1. A4 comparison
{
  const d = createDefaultTable({ rows: 9, cols: 4 });
  d.title = 'Comparison sheet (A4)';
  d.styles.themeId = 'cobalt';
  widths(d, [190, 160, 160, 160]);
  fill(d, [
    ['Feature', 'Option A', 'Option B', 'Option C'],
    ['Price', '$10', '$25', '$40'],
    ['Storage', '10 GB', '100 GB', '1 TB'],
    ['Users', '1', '5', 'Unlimited'],
    ['Support', 'Email', 'Email + chat', '24/7 phone'],
    ['API access', 'No', 'Yes', 'Yes'],
    ['Uptime SLA', '—', '99.5%', '99.99%'],
    ['Free trial', '14 days', '14 days', '30 days'],
    ['Best for', 'Individuals', 'Small teams', 'Companies'],
  ]);
  templates.push({ id: 'a4-comparison', name: 'A4 comparison sheet', description: 'Portrait feature comparison with a cobalt header.', doc: d });
}

// 2. Pricing grid
{
  const d = createDefaultTable({ rows: 8, cols: 4 });
  d.title = 'Pricing grid';
  d.aspectRatio = 'sqrt2:1';
  d.styles.themeId = 'forest';
  d.styles.headerRows = 2;
  widths(d, [240, 220, 220, 220]);
  fill(d, [
    ['Simple, honest pricing', '', '', ''],
    ['', 'Starter', 'Team', 'Business'],
    ['Monthly price', '$9', '$29', '$99'],
    ['Seats', '1', '10', '50'],
    ['Projects', '3', 'Unlimited', 'Unlimited'],
    ['Priority support', '', '✓', '✓'],
    ['SSO', '', '', '✓'],
    ['Yearly (2 months free)', '=C3*10', '=D3*10', '=E3*10'],
  ].map((r) => r.slice(0, 4)));
  d.cells['7:1'].value = '=B3*10';
  d.cells['7:2'].value = '=C3*10';
  d.cells['7:3'].value = '=D3*10';
  mergeRange(d, { r1: 0, c1: 0, r2: 0, c2: 3 });
  d.cells['0:0'].style = { align: 'center', fontSize: 22, bold: true };
  d.rows[0].height = 56;
  templates.push({ id: 'pricing-grid', name: 'Pricing grid', description: 'Landscape plans table with merged title and formulas.', doc: d });
}

// 3. Weekly schedule
{
  const d = createDefaultTable({ rows: 11, cols: 8 });
  d.title = 'Weekly schedule';
  d.aspectRatio = 'sqrt2:1';
  d.styles.themeId = 'slate';
  d.styles.zebra = false;
  widths(d, [80, 120, 120, 120, 120, 120, 120, 120]);
  fill(d, [['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], ...Array.from({ length: 10 }, (_, i) => [`${8 + i}:00`])]);
  put(d, 2, 1, 'Team meeting', { bg: '#dbeafe' });
  put(d, 5, 3, 'Gym', { bg: '#dcfce7' });
  mergeRange(d, { r1: 4, c1: 2, r2: 5, c2: 2 });
  put(d, 4, 2, 'Workshop', { bg: '#fef3c7', valign: 'top' });
  templates.push({ id: 'weekly-schedule', name: 'Weekly schedule', description: 'Landscape timetable with merged blocks.', doc: d });
}

// 4. Invoice
{
  const d = createDefaultTable({ rows: 10, cols: 4 });
  d.title = 'Invoice';
  d.styles.themeId = 'paper';
  widths(d, [320, 90, 130, 140]);
  fill(d, [
    ['Description', 'Qty', 'Unit price', 'Amount'],
    ['Design work', '10', '45', '=B2*C2'],
    ['Development', '24', '60', '=B3*C3'],
    ['Hosting (annual)', '1', '120', '=B4*C4'],
    ['', '', '', ''],
    ['', '', '', ''],
    ['', '', 'Subtotal', '=SUM(D2:D6)'],
    ['', '', 'Tax (10%)', '=ROUND(D7*0.1,2)'],
    ['', '', 'Total', '=D7+D8'],
  ]);
  for (const c of [2, 3]) d.cells[`8:${c}`].style = { bold: true, fontSize: 16 };
  d.canvas.lockMode = 'autoscale';
  templates.push({ id: 'invoice', name: 'Invoice', description: 'Line items with SUM / ROUND formulas.', doc: d });
}

// 5. Task tracker
{
  const d = createDefaultTable({ rows: 9, cols: 4 });
  d.title = 'Task tracker';
  d.styles.themeId = 'plum';
  widths(d, [60, 300, 140, 120]);
  fill(d, [
    ['Done', 'Task', 'Status', 'Priority'],
    ['', 'Write project brief', 'In progress', '2'],
    ['', 'Collect feedback', 'To do', '1'],
    ['', 'Prototype', 'To do', '3'],
    ['', 'Review', 'Blocked', '2'],
  ]);
  for (let r = 1; r < 9; r++) d.cells[`${r}:0`] = { value: r === 1 ? 'TRUE' : 'FALSE', type: 'boolean', style: { align: 'center' } };
  d.validations.push({ id: 'dv1', range: { r1: 1, c1: 2, r2: 8, c2: 2 }, type: 'select', options: ['To do', 'In progress', 'Blocked', 'Done'] });
  d.validations.push({ id: 'dv2', range: { r1: 1, c1: 3, r2: 8, c2: 3 }, type: 'number', min: 1, max: 5 });
  d.conditionalRules.push({ id: 'cf1', range: { r1: 1, c1: 2, r2: 8, c2: 2 }, op: 'eq', value: 'Blocked', style: { bg: '#fee2e2', color: '#991b1b', bold: true } });
  d.conditionalRules.push({ id: 'cf2', range: { r1: 1, c1: 3, r2: 8, c2: 3 }, op: 'dataBar', barColor: '#d9b8e6' });
  templates.push({ id: 'task-tracker', name: 'Task tracker', description: 'Checkboxes, dropdown statuses and priority data bars.', doc: d });
}

for (const t of templates) writeFileSync(new URL(`${t.id}.json`, OUT), JSON.stringify(t.doc, null, 2));
writeFileSync(
  new URL('index.json', OUT),
  JSON.stringify(templates.map(({ id, name, description }) => ({ id, name, description, file: `${id}.json` })), null, 2),
);
console.log(`Wrote ${templates.length} templates to public/templates/`);
