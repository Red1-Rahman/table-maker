import { expect, test } from '../fixtures/diagnostics';
import { cell, gotoApp, rowHeader, setCell } from './helpers';

test.describe('grid editing', () => {
  test('edits a cell and undoes and redoes the change', async ({ page }) => {
    await gotoApp(page);
    await setCell(page, 1, 0, 'Edited');
    await expect(cell(page, 1, 0)).toHaveText('Edited');

    await page.keyboard.press('Control+z');
    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS');
    await page.keyboard.press('Control+Shift+z');
    await expect(cell(page, 1, 0)).toHaveText('Edited');
  });

  test('clears a cell and restores it with undo', async ({ page }) => {
    await gotoApp(page);
    await cell(page, 2, 0).click();
    await page.keyboard.press('Delete');
    await expect(cell(page, 2, 0)).toHaveText('');
    await page.keyboard.press('Control+z');
    await expect(cell(page, 2, 0)).toHaveText('Nobara');
  });

  test('evaluates SUM, IF and ROUND formulas', async ({ page }) => {
    await gotoApp(page);
    // Starter column D holds 9, 9, 10, 10, 7 in D2:D6.
    await setCell(page, 7, 3, '=SUM(D2:D6)');
    await expect(cell(page, 7, 3)).toHaveText('45');

    await setCell(page, 7, 2, '=IF(D8>40,"big","small")');
    await expect(cell(page, 7, 2)).toHaveText('big');

    await setCell(page, 7, 1, '=ROUND(AVERAGE(D2:D6),2)');
    await expect(cell(page, 7, 1)).toHaveText('9');

    await setCell(page, 7, 0, '=ROUND(1234.5678,-2)');
    await expect(cell(page, 7, 0)).toHaveText('1200');

    // The average row from the starter table keeps working after edits above.
    await expect(cell(page, 6, 3)).toHaveText('9');
  });

  test('inserts and deletes rows through the row header menu', async ({ page }) => {
    await gotoApp(page);
    await rowHeader(page, 1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Insert row above', exact: true }).click();
    await expect(page.locator('footer').getByText('9 × 4 cells')).toBeVisible();
    // A blank row is pushed in at index 1, so the old first data row moves down.
    await expect(cell(page, 1, 0)).toHaveText('');
    await expect(cell(page, 2, 0)).toHaveText('Pop!_OS');

    await rowHeader(page, 1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete row', exact: true }).click();
    await expect(page.locator('footer').getByText('8 × 4 cells')).toBeVisible();
    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS');
  });

  test('inserts and deletes columns and keeps formulas in step', async ({ page }) => {
    await gotoApp(page);
    await page.locator('[data-col-header="0"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Insert column left', exact: true }).click();
    await expect(page.locator('footer').getByText('8 × 5 cells')).toBeVisible();

    await page.locator('[data-col-header="0"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete column', exact: true }).click();
    await expect(page.locator('footer').getByText('8 × 4 cells')).toBeVisible();
    await expect(cell(page, 6, 3)).toHaveText('9');
  });

  test('merges and unmerges a selection', async ({ page }) => {
    await gotoApp(page);
    await cell(page, 0, 0).click();
    await cell(page, 0, 1).click({ modifiers: ['Shift'] });
    await page.locator('[data-cell][data-r="0"][data-c="0"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Merge cells', exact: true }).click();

    // The merged anchor spans both columns and the covered cell disappears.
    await expect(page.locator('[data-cell][data-r="0"][data-c="1"]')).toHaveCount(0);
    const widthOf = (sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().width);
    // Compare with an unmerged cell of column 0: the merged anchor must be clearly wider.
    expect(await widthOf('[data-cell][data-r="0"][data-c="0"]')).toBeGreaterThan(
      1.5 * (await widthOf('[data-cell][data-r="1"][data-c="0"]')),
    );

    await page.locator('[data-cell][data-r="0"][data-c="0"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Unmerge cells', exact: true }).click();
    await expect(page.locator('[data-cell][data-r="0"][data-c="1"]')).toHaveCount(1);
  });

  test('reorders a column by dragging its header', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'webkit') {
      test.fixme(
        true,
        'Playwright cannot drive native HTML5 drag and drop in WebKit, so dragTo never fires the app drop handler. ' +
          'Column reordering is covered by the Firefox project and by the Vitest unit tests for gridMatrix.moveLine.',
      );
      return;
    }
    await gotoApp(page);
    await expect(cell(page, 0, 0)).toHaveText('Distribution');
    await page.locator('[data-col-header="0"]').dragTo(page.locator('[data-col-header="2"]'));
    await expect(cell(page, 0, 0)).toHaveText('Base');
    await expect(cell(page, 0, 2)).toHaveText('Distribution');
  });
});