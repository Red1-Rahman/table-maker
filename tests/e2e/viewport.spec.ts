import { expect, test } from '../fixtures/diagnostics';
import { gotoApp } from './helpers';

const zoomLabel = (page: import('@playwright/test').Page) => page.getByTestId('zoom-label');

async function zoomPercent(page: import('@playwright/test').Page): Promise<number> {
  const text = (await zoomLabel(page).textContent()) ?? '0%';
  return Number(text.replace('%', ''));
}

test.describe('zoom and pan', () => {
  test('Ctrl/Cmd + wheel zooms in and out around the pointer', async ({ page }) => {
    await gotoApp(page);
    const before = await zoomPercent(page);
    const scroll = page.getByTestId('canvas-scroll');
    const box = (await scroll.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -400);
    await page.keyboard.up('Control');
    await expect.poll(() => zoomPercent(page)).toBeGreaterThan(before);

    const zoomed = await zoomPercent(page);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 600);
    await page.keyboard.up('Control');
    await expect.poll(() => zoomPercent(page)).toBeLessThan(zoomed);
  });

  test('plain wheel scrolls the canvas instead of zooming', async ({ page }) => {
    await gotoApp(page);
    const before = await zoomPercent(page);
    const scroll = page.getByTestId('canvas-scroll');
    const box = (await scroll.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);
    expect(await zoomPercent(page)).toBe(before);
  });

  test('zoom stays inside the 10% to 500% limits', async ({ page }) => {
    await gotoApp(page);
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    expect(await zoomPercent(page)).toBeLessThanOrEqual(500);
    for (let i = 0; i < 30; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
    expect(await zoomPercent(page)).toBeGreaterThanOrEqual(10);
  });

  test('pans with a space + drag', async ({ page }) => {
    await gotoApp(page);
    // Zoom in until the sheet really overflows the scroll container, otherwise there is nothing to pan.
    const scroll = page.getByTestId('canvas-scroll');
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect
      .poll(() => scroll.evaluate((el) => el.scrollWidth > el.clientWidth + 10))
      .toBe(true);

    const box = (await scroll.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.keyboard.down('Space');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 - 100, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test('fit to screen returns to a readable zoom', async ({ page }) => {
    await gotoApp(page);
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    await expect.poll(() => zoomPercent(page)).toBeGreaterThan(5);
    await expect(page.getByTestId('page')).toBeVisible();
  });
});