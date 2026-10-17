import { strFromU8, unzipSync } from 'fflate';
import { expect, test } from '../fixtures/diagnostics';
import { cell, gotoApp } from './helpers';

const DATA_DIR = 'tests/e2e/fixtures/data';
const TITLE = 'Linux distros for gaming';
const SAFE_TITLE = TITLE.replace(/\s+/g, '-');

/** Accepts the native confirm dialog the import flow can raise, so no test blocks on it. */
test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
});

async function importFile(page: import('@playwright/test').Page, file: string): Promise<void> {
  await page.getByTestId('import-input').setInputFiles(`${DATA_DIR}/${file}`);
  await expect(page.getByText(`Imported ${file}`)).toBeVisible();
}

async function downloadExports(
  page: import('@playwright/test').Page,
  formats: string[],
  opts: { zip?: boolean; pixelRatio?: string } = {},
): Promise<import('@playwright/test').Download[]> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  for (const label of ['CSV', 'Excel', 'Markdown', 'HTML', 'JSON', 'PDF', 'PNG']) {
    const box = page.getByRole('checkbox', { name: new RegExp(`^${label}\\b`) });
    const wanted = formats.includes(label);
    if ((await box.isChecked()) !== wanted) await box.click();
  }
  const zipBox = page.getByRole('checkbox', { name: /^Package multiple files/ });
  if ((await zipBox.isChecked()) !== (opts.zip ?? true)) await zipBox.click();
  if (opts.pixelRatio) await page.getByLabel('Image / raster resolution').selectOption(opts.pixelRatio);
  const files = formats.length > 1 ? 1 : formats.length;
  const downloads: import('@playwright/test').Download[] = [];
  const waitFor = Array.from({ length: files }, () => page.waitForEvent('download'));
  await page.getByRole('button', { name: 'Download selected' }).click();
  for (const p of waitFor) downloads.push(await p);
  await expect(page.getByText(/Exported \d+ format/)).toBeVisible({ timeout: 30_000 });
  return downloads;
}

async function readText(download: import('@playwright/test').Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test.describe('import', () => {
  test('imports CSV', async ({ page }) => {
    await gotoApp(page);
    await importFile(page, 'sample.csv');
    await expect(cell(page, 0, 0)).toHaveText('Region');
    await expect(cell(page, 0, 1)).toHaveText('Units');
    await expect(cell(page, 3, 1)).toHaveText('203');
    await expect(page.getByLabel('Table title')).toHaveValue('sample');
    await expect(page.locator('footer').getByText('5 × 3 cells')).toBeVisible();
  });

  test('imports JSON records', async ({ page }) => {
    await gotoApp(page);
    await importFile(page, 'sample.json');
    await expect(cell(page, 0, 0)).toHaveText('Region');
    await expect(cell(page, 3, 1)).toHaveText('203');
  });

  test('imports a Markdown table', async ({ page }) => {
    await gotoApp(page);
    await importFile(page, 'sample.md');
    await expect(cell(page, 0, 0)).toHaveText('Region');
    await expect(cell(page, 2, 2)).toHaveText('3150');
  });

  test('imports XLSX', async ({ page }) => {
    await gotoApp(page);
    await importFile(page, 'sample.xlsx');
    await expect(cell(page, 0, 0)).toHaveText('Region');
    await expect(cell(page, 3, 2)).toHaveText('9210');
    await expect(page.locator('footer').getByText('4 × 3 cells')).toBeVisible();
  });
});

test.describe('export', () => {
  test('exports CSV with the suggested name and valid structure', async ({ page }) => {
    await gotoApp(page);
    const [download] = await downloadExports(page, ['CSV']);
    expect(download.suggestedFilename()).toBe(`${SAFE_TITLE}.csv`);
    const text = await readText(download);
    const lines = text.trim().split(/\r?\n/);
    expect(lines[0]).toContain('Distribution');
    expect(lines.length).toBeGreaterThanOrEqual(7);
    for (const line of lines) expect(line.split(',').length).toBe(4);
  });

  test('exports JSON that parses back into the document', async ({ page }) => {
    await gotoApp(page);
    const [download] = await downloadExports(page, ['JSON']);
    expect(download.suggestedFilename()).toBe(`${SAFE_TITLE}.json`);
    const parsed = JSON.parse(await readText(download));
    expect(parsed.format).toBe('table-maker');
    expect(parsed.document.title).toBe(TITLE);
    expect(parsed.document.cells['0:0'].value).toBe('Distribution');
  });

  test('exports a Markdown pipe table', async ({ page }) => {
    await gotoApp(page);
    const [download] = await downloadExports(page, ['Markdown']);
    expect(download.suggestedFilename()).toBe(`${SAFE_TITLE}.md`);
    const text = await readText(download);
    expect(text.split(/\r?\n/)[0]).toMatch(/^\|\s*Distribution\s*\|/);
    expect(text).toMatch(/^\|(?:[\s:-]+\|)+$/m);
  });

  test('exports sanitised HTML with a table element', async ({ page }) => {
    await gotoApp(page);
    const [download] = await downloadExports(page, ['HTML']);
    expect(download.suggestedFilename()).toBe(`${SAFE_TITLE}.html`);
    const html = await readText(download);
    expect(html).toContain('<table');
    expect(html).toContain('Distribution');
    expect(html).not.toContain('<script');
  });

  test('exports a PDF that starts with the PDF signature', async ({ page }) => {
    await gotoApp(page);
    const [download] = await downloadExports(page, ['PDF'], { pixelRatio: '1' });
    expect(download.suggestedFilename()).toBe(`${SAFE_TITLE}.pdf`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test('exports a PNG with a valid signature and real content', async ({ page }) => {
    await gotoApp(page);
    const [download] = await downloadExports(page, ['PNG'], { pixelRatio: '1' });
    expect(download.suggestedFilename()).toBe(`${SAFE_TITLE}.png`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test('packages every selected format into one zip', async ({ page }) => {
    await gotoApp(page);
    const [download] = await downloadExports(page, ['CSV', 'Markdown', 'JSON']);
    expect(download.suggestedFilename()).toBe(`${SAFE_TITLE}.zip`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const entries = unzipSync(Buffer.concat(chunks));
    expect(Object.keys(entries).sort()).toEqual([`${SAFE_TITLE}.csv`, `${SAFE_TITLE}.json`, `${SAFE_TITLE}.md`]);
    expect(strFromU8(entries[`${SAFE_TITLE}.md`])).toContain('Distribution');
    expect(strFromU8(entries[`${SAFE_TITLE}.csv`])).toContain('Nobara');
  });
});