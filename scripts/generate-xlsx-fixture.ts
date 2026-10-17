/**
 * Builds tests/e2e/fixtures/data/sample.xlsx from scratch with fflate (already a runtime dependency).
 * Run with: npx tsx scripts/generate-xlsx-fixture.ts
 * The committed file keeps the e2e suite free of a generation step.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../tests/e2e/fixtures/data/sample.xlsx');

const sheetRows: string[][] = [
  ['Region', 'Units', 'Revenue'],
  ['North', '120', '4800'],
  ['South', '84', '3150'],
  ['East', '203', '9210'],
];

const col = (i: number) => String.fromCharCode(65 + i);
const cells = sheetRows
  .map((row, r) =>
    row
      .map(
        (v, c) =>
          `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t>${v}</t></is></c>`,
      )
      .join(''),
  )
  .join('');

const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`;

const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const zip = zipSync(
  {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  },
  { level: 6 },
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip);
console.log(`wrote ${out} (${zip.length} bytes)`);