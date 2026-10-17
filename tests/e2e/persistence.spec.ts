import { expect, test } from '../fixtures/diagnostics';
import { cell, gotoApp, readIndexedDbDraft, setCell, waitForDraftSaved } from './helpers';

test.describe('draft autosave', () => {
  test('persists the draft in IndexedDB and restores it after a reload', async ({ page }) => {
    await gotoApp(page);
    await setCell(page, 1, 0, 'Persisted value');
    await waitForDraftSaved(page);

    // The app must use IndexedDB, not the localStorage fallback.
    const draft = await readIndexedDbDraft(page);
    expect(draft, 'draft missing from IndexedDB').toContain('Persisted value');
    const fallback = await page.evaluate(() => localStorage.getItem('tablemaker.draft.v1'));
    expect(fallback, 'localStorage fallback should not be used while IndexedDB works').toBeNull();

    await page.reload();
    await expect(page.getByTestId('grid')).toBeVisible();
    await expect(cell(page, 1, 0)).toHaveText('Persisted value');
    await expect(page.getByText('Restored your last draft.')).toBeVisible();
  });

  test('restores formulas after a reload', async ({ page }) => {
    await gotoApp(page);
    await setCell(page, 7, 3, '=SUM(D2:D6)');
    await waitForDraftSaved(page);

    await page.reload();
    await expect(cell(page, 7, 3)).toHaveText('45');
    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS');
  });

  test('a fresh context does not see another test draft', async ({ browser }) => {
    const first = await browser.newContext();
    const firstPage = await first.newPage();
    await gotoApp(firstPage);
    await setCell(firstPage, 1, 0, 'Only in context A');
    await waitForDraftSaved(firstPage);
    await first.close();

    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await gotoApp(secondPage);
    await expect(cell(secondPage, 1, 0)).toHaveText('Pop!_OS');
    await second.close();
  });
});