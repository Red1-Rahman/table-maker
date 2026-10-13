import { AIError, type AIAdapter } from '@/types/ai';
import { readError } from './http';

export const anthropicAdapter: AIAdapter = {
  async complete(req, cfg, signal) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        // required for direct browser (CORS) access; the key never leaves the user's browser
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 8000,
        temperature: 0.2,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      }),
    });
    if (!res.ok) throw new AIError(await readError(res), res.status, 'anthropic');
    const data = await res.json();
    const text = (data?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
    if (!text) throw new AIError('Empty response from Anthropic', res.status, 'anthropic');
    return text;
  },
};
