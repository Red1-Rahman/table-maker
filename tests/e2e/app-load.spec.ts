import { expect, test } from '../fixtures/diagnostics';
import { gotoApp, samplePixels } from './helpers';

test.describe('app load', () => {
  test('serves the production build from the GitHub Pages base path', async ({ page, diagnostics }) => {
    await gotoApp(page);

    const basePath = new URL(page.url()).pathname;
    expect(basePath).toMatch(/^\/table-maker\/$/);
    await expect(page).toHaveTitle('Table Maker');
    await expect(page.getByTestId('page-label')).toContainText('A · portrait');

    // MIME types: the preview server (like GitHub Pages) must label assets correctly.
    const responses = diagnostics.sameOriginResponses();
    expect(responses.length).toBeGreaterThan(3);
    const byType = (fragment: string) => responses.find((r) => r.url.includes(fragment) && r.status !== null);
    expect(byType('.js')?.contentType ?? '').toMatch(/javascript/);
    expect(byType('.css')?.contentType ?? '').toMatch(/text\/css/);
    expect(byType('/logo.svg')?.contentType ?? '').toMatch(/image\/svg/);
    for (const r of responses) expect(r.status, `${r.url} returned ${r.status}`).toBeLessThan(400);
  });

  test('paints a non-blank canvas (pixel sampling, not a screenshot diff)', async ({ page }) => {
    await gotoApp(page);
    const sheet = await page.getByTestId('page').screenshot();
    const stats = await samplePixels(page, sheet);
    expect(stats.width).toBeGreaterThan(100);
    expect(stats.height).toBeGreaterThan(100);
    // Text, borders and the accent colour all differ: a blank sheet would be one flat colour.
    expect(stats.distinctColours).toBeGreaterThanOrEqual(4);
    expect(stats.nonWhiteRatio).toBeGreaterThan(0.01);
  });
});