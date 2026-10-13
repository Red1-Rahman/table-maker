import { expect, test } from '@playwright/test';

test('loads, edits a cell and exports CSV', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('page')).toBeVisible();
  await page.locator('[data-cell][data-r="1"][data-c="0"]').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Edited');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-cell][data-r="1"][data-c="0"]')).toHaveText('Edited');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Download selected' }).click();
  await expect(page.getByText(/Exported \d+ format/)).toBeVisible({ timeout: 20_000 });
});

test('undo restores the previous value', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-cell][data-r="2"][data-c="0"]').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-cell][data-r="2"][data-c="0"]')).toHaveText('');
  await page.keyboard.press('Control+Z');
  await expect(page.locator('[data-cell][data-r="2"][data-c="0"]')).toHaveText('Nobara');
});
