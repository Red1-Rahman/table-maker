import { type Page, expect } from '@playwright/test';
import { test } from '../fixtures/diagnostics';
import { cell, gotoApp } from './helpers';

/**
 * Two levels of clipboard coverage:
 *
 * 1. Synthetic clipboard events: exercises the app's own clipboard code in every engine, no
 *    permissions needed.
 * 2. The real OS clipboard. Playwright only grants `clipboard-read` / `clipboard-write` in some
 *    engines, so where it is unsupported the test is marked as a known gap with a written reason
 *    instead of being silently skipped.
 */
test.describe('clipboard', () => {
  /**
   * Firefox ignores `clipboardData` in the ClipboardEvent constructor init dict, so the event is
   * built by hand with a DataTransfer attached as a property. That works in every engine.
   */
  async function fireClipboardEvent(page: Page, type: 'copy' | 'cut' | 'paste', data: Record<string, string> = {}) {
    return page.evaluate(
      ({ type, data }) => {
        const dt = new DataTransfer();
        for (const [k, v] of Object.entries(data)) dt.setData(k, v);
        const ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'clipboardData', { value: dt });
        document.dispatchEvent(ev);
        return { plain: dt.getData('text/plain'), html: dt.getData('text/html') };
      },
      { type, data },
    );
  }

  test('copy and paste through synthetic clipboard events', async ({ page }) => {
    await gotoApp(page);
    await cell(page, 0, 0).click();
    await cell(page, 1, 0).click({ modifiers: ['Shift'] });

    const copied = await fireClipboardEvent(page, 'copy');
    expect(copied.plain).toBe('Distribution\nPop!_OS');
    expect(copied.html).toContain('<table');

    await cell(page, 4, 0).click();
    await fireClipboardEvent(page, 'paste', { 'text/plain': copied.plain, 'text/html': copied.html });

    await expect(cell(page, 4, 0)).toHaveText('Distribution');
    await expect(cell(page, 5, 0)).toHaveText('Pop!_OS');
  });

  test('cuts a range and clears the source cells', async ({ page }) => {
    await gotoApp(page);
    await cell(page, 1, 0).click();
    await cell(page, 1, 1).click({ modifiers: ['Shift'] });
    const copied = await fireClipboardEvent(page, 'cut');
    expect(copied.plain).toBe('Pop!_OS\tUbuntu');
    await expect(cell(page, 1, 0)).toHaveText('');
    await expect(cell(page, 1, 1)).toHaveText('');

    await cell(page, 4, 0).click();
    await fireClipboardEvent(page, 'paste', { 'text/plain': copied.plain });
    await expect(cell(page, 4, 0)).toHaveText('Pop!_OS');
    await expect(cell(page, 4, 1)).toHaveText('Ubuntu');
  });

  test('copies and pastes through the operating system clipboard', async ({ page, context }) => {
    let supported = true;
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    } catch {
      supported = false;
    }
    if (!supported) {
      test.fixme(
        true,
        'This engine refuses clipboard permissions in headless mode, so the OS clipboard path cannot be driven here. ' +
          'The in-app clipboard logic is still covered by the two synthetic-event tests above and by the Vitest component tests.',
      );
      return;
    }

    await gotoApp(page);
    await cell(page, 0, 0).click();
    await cell(page, 1, 0).click({ modifiers: ['Shift'] });
    await page.keyboard.press('Control+c');
    await cell(page, 4, 0).click();
    await page.keyboard.press('Control+v');

    await expect(cell(page, 4, 0)).toHaveText('Distribution');
    await expect(cell(page, 5, 0)).toHaveText('Pop!_OS');
  });
});