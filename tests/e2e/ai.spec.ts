import { expect, test } from '../fixtures/diagnostics';
import { cell, gotoApp } from './helpers';

const OPENAI = 'https://api.openai.com/v1/chat/completions';
const GEMINI = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^:]+:generateContent$/;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

const KEYS = { openai: 'sk-test-openai-key', gemini: 'AIza-test-gemini-key', anthropic: 'sk-ant-test-key' };

interface Seen {
  provider: string;
  headers: Record<string, string>;
}

/** Table the mocked model returns: same shape as the starter table with one visible change. */
const MODEL_TABLE = {
  message: 'Renamed the first data row.',
  table: {
    rows: [
      ['Distribution', 'Base', 'Gaming focus', 'Score'],
      ['Pop!_OS refreshed', 'Ubuntu', 'Good NVIDIA support', '9'],
      ['Nobara', 'Fedora', 'Pre-patched for games', '9'],
      ['Bazzite', 'Fedora Atomic', 'Console-like experience', '10'],
      ['SteamOS', 'Arch', 'Steam Deck', '10'],
      ['Linux Mint', 'Ubuntu', 'Stable general purpose', '7'],
      ['Average', '', '', '=ROUND(AVERAGE(D2:D6),1)'],
      ['', '', '', ''],
    ],
  },
};

function openAiBody(): string {
  return JSON.stringify({ choices: [{ message: { content: JSON.stringify(MODEL_TABLE) } }] });
}
function geminiBody(): string {
  return JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(MODEL_TABLE) }] } }] });
}
function anthropicBody(): string {
  return JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(MODEL_TABLE) }] });
}

async function installProviders(
  page: import('@playwright/test').Page,
  handlers: Record<'openai' | 'gemini' | 'anthropic', () => { status: number; body: string }>,
): Promise<Seen[]> {
  const seen: Seen[] = [];
  const record = (provider: string) => (req: import('@playwright/test').Request) => {
    seen.push({ provider, headers: req.headers() });
  };
  await page.route(OPENAI, async (route) => {
    record('openai')(route.request());
    const r = handlers.openai();
    await route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
  });
  await page.route(GEMINI, async (route) => {
    record('gemini')(route.request());
    const r = handlers.gemini();
    await route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
  });
  await page.route(ANTHROPIC, async (route) => {
    record('anthropic')(route.request());
    const r = handlers.anthropic();
    await route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
  });
  return seen;
}

const ok = {
  openai: () => ({ status: 200, body: openAiBody() }),
  gemini: () => ({ status: 200, body: geminiBody() }),
  anthropic: () => ({ status: 200, body: anthropicBody() }),
};

async function setKeys(page: import('@playwright/test').Page, keys: Partial<Record<'openai' | 'gemini' | 'anthropic', string>>): Promise<void> {
  await page.getByRole('button', { name: 'AI keys' }).click();
  const labels = { openai: 'OpenAI API key', gemini: 'Google Gemini API key', anthropic: 'Anthropic Claude API key' };
  for (const [provider, value] of Object.entries(keys)) {
    await page.getByLabel(labels[provider as keyof typeof labels], { exact: true }).fill(value ?? '');
  }
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function runPrompt(page: import('@playwright/test').Page, instruction: string): Promise<void> {
  await page.getByLabel('AI instruction').fill(instruction);
  await page.getByRole('button', { name: 'Run' }).click();
}

test.describe('AI editing with mocked providers', () => {
  test('sends the OpenAI key only to OpenAI and applies the change as one undo step', async ({ page }) => {
    await gotoApp(page);
    const seen = await installProviders(page, ok);
    await setKeys(page, { openai: KEYS.openai, gemini: KEYS.gemini });
    await page.keyboard.press('Control+k');
    await runPrompt(page, 'Rename the first data row');

    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS refreshed');
    await expect(page.getByTestId('ai-log')).toContainText('applied, press Ctrl/Cmd+Z to undo.');

    expect(seen.length).toBe(1);
    expect(seen[0].provider).toBe('openai');
    expect(seen[0].headers.authorization).toBe(`Bearer ${KEYS.openai}`);
    // The Gemini key must never travel to OpenAI, and no other provider header is present.
    expect(JSON.stringify(seen[0].headers)).not.toContain(KEYS.gemini);
    expect(seen[0].headers['x-goog-api-key']).toBeUndefined();

    await page.keyboard.press('Control+z');
    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS');
  });

  test('falls back to the next provider on 401, 429 and 500', async ({ page, diagnostics }) => {
    // The mocked failures make WebKit log a resource error for each non-2xx response. The messages
    // come from the deliberately broken mock, so they are allowlisted per test with this reason.
    diagnostics.allowConsole(
      /^Failed to load resource: the server responded with a status of (401|429|500)/,
      'deliberately mocked provider failure in this spec; WebKit logs one console error per non-2xx fetch',
    );
    await gotoApp(page);
    const seen = await installProviders(page, {
      openai: () => ({ status: 401, body: JSON.stringify({ error: { message: 'invalid api key' } }) }),
      gemini: () => ({ status: 429, body: JSON.stringify({ error: { message: 'quota exceeded' } }) }),
      anthropic: ok.anthropic,
    });
    await setKeys(page, { openai: KEYS.openai, gemini: KEYS.gemini, anthropic: KEYS.anthropic });
    await page.keyboard.press('Control+k');
    await runPrompt(page, 'Rename the first data row');

    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS refreshed');
    await expect(page.getByTestId('ai-log')).toContainText('switched provider after: openai, gemini');
    expect(seen.map((s) => s.provider)).toEqual(['openai', 'gemini', 'anthropic']);
    expect(seen[0].headers.authorization).toBe(`Bearer ${KEYS.openai}`);
    expect(seen[1].headers['x-goog-api-key']).toBe(KEYS.gemini);
    expect(seen[2].headers['x-api-key']).toBe(KEYS.anthropic);
    // Each key reached its own origin only.
    expect(JSON.stringify(seen[0].headers)).not.toContain(KEYS.anthropic);
    expect(JSON.stringify(seen[1].headers)).not.toContain(KEYS.openai);
    expect(JSON.stringify(seen[2].headers)).not.toContain(KEYS.gemini);

    await page.keyboard.press('Control+z');
    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS');
  });

  test('reports an error in the log when every provider fails', async ({ page, diagnostics }) => {
    diagnostics.allowConsole(
      /^Failed to load resource: the server responded with a status of 500/,
      'deliberately mocked provider failure in this spec; WebKit logs one console error per non-2xx fetch',
    );
    await gotoApp(page);
    await installProviders(page, {
      openai: () => ({ status: 500, body: JSON.stringify({ error: { message: 'boom' } }) }),
      gemini: () => ({ status: 500, body: JSON.stringify({ error: { message: 'boom' } }) }),
      anthropic: () => ({ status: 500, body: JSON.stringify({ error: { message: 'boom' } }) }),
    });
    await setKeys(page, { openai: KEYS.openai });
    await page.keyboard.press('Control+k');
    await runPrompt(page, 'Rename the first data row');

    await expect(page.getByTestId('ai-log')).toContainText('AI request failed');
    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS');
  });

  test('does not call a provider that has no key', async ({ page }) => {
    await gotoApp(page);
    const seen = await installProviders(page, ok);
    await setKeys(page, { anthropic: KEYS.anthropic });
    await page.keyboard.press('Control+k');
    await runPrompt(page, 'Rename the first data row');

    await expect(cell(page, 1, 0)).toHaveText('Pop!_OS refreshed');
    expect(seen.map((s) => s.provider)).toEqual(['anthropic']);
    expect(seen[0].headers.authorization).toBeUndefined();
  });
});