import { type Locator, type Page, expect } from '@playwright/test';

/** Opens the app and waits until the starter table is painted. */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.getByTestId('page')).toBeVisible();
  await expect(page.getByTestId('grid')).toBeVisible();
  await expect(cell(page, 0, 0)).toHaveText('Distribution');
}

export function cell(page: Page, r: number, c: number): Locator {
  return page.locator(`[data-cell][data-r="${r}"][data-c="${c}"]`);
}

export function rowHeader(page: Page, r: number): Locator {
  return page.locator(`[data-row-header="${r}"]`);
}

/** Writes a value through the formula bar: it works for text, numbers and formulas alike. */
export async function setCell(page: Page, r: number, c: number, value: string): Promise<void> {
  await cell(page, r, c).click();
  const input = page.getByTestId('formula-input');
  await input.click();
  await expect(input).toBeFocused();
  await input.fill(value);
  await input.press('Enter');
  await expect(input).not.toBeFocused();
}

export interface PixelStats {
  width: number;
  height: number;
  distinctColours: number;
  nonWhiteRatio: number;
  inkPixels: number;
}

/**
 * Samples pixels of a PNG buffer inside the browser (no screenshot comparison baseline).
 * Used to prove the page really painted instead of showing an empty sheet.
 */
export async function samplePixels(page: Page, png: Buffer): Promise<PixelStats> {
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const colours = new Set<number>();
    let inkPixels = 0;
    const total = canvas.width * canvas.height;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 8) continue;
      colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
      if (r < 235 || g < 235 || b < 235) inkPixels += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      distinctColours: colours.size,
      nonWhiteRatio: inkPixels / total,
      inkPixels,
    };
  }, png.toString('base64'));
}

/** Waits for the debounced draft autosave to report success. */
export async function waitForDraftSaved(page: Page): Promise<void> {
  await expect(page.locator('header').getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
}

export async function readIndexedDbDraft(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open('table-maker', 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('drafts')) return resolve(null);
          const get = db.transaction('drafts', 'readonly').objectStore('drafts').get('current');
          get.onsuccess = () => {
            db.close();
            resolve(get.result ? JSON.stringify(get.result) : null);
          };
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}