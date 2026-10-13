export async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    const msg = j?.error?.message ?? j?.error ?? j?.message;
    if (typeof msg === 'string') return `${res.status}: ${msg}`;
  } catch {
    /* ignore */
  }
  if (res.status === 429) return '429: rate limit or quota reached';
  return `${res.status}: ${res.statusText || 'request failed'}`;
}
