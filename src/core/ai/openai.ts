import { AIError, type AIAdapter } from '@/types/ai';
import { readError } from './http';

export const openaiAdapter: AIAdapter = {
  async complete(req, cfg, signal) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ],
      }),
    });
    if (!res.ok) throw new AIError(await readError(res), res.status, 'openai');
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new AIError('Empty response from OpenAI', res.status, 'openai');
    return text;
  },
};
