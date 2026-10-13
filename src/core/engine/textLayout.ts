import type { ResolvedStyle } from './resolve';

export const LINE_HEIGHT = 1.3;

/** Break text into display lines (explicit newlines, optional word wrap, list prefixes). */
export function layoutLines(
  text: string,
  style: Pick<ResolvedStyle, 'wrap' | 'list'>,
  innerWidth: number,
  measure: (s: string) => number,
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const out: string[] = [];
  paragraphs.forEach((para, i) => {
    const prefix = style.list === 'bullet' ? '• ' : style.list === 'number' ? `${i + 1}. ` : '';
    const full = prefix + para;
    if (!style.wrap || innerWidth <= 0) {
      out.push(full);
      return;
    }
    out.push(...wrapParagraph(full, innerWidth, measure));
  });
  return out;
}

function wrapParagraph(text: string, maxW: number, measure: (s: string) => number): string[] {
  if (text === '' || measure(text) <= maxW) return [text];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line.trim() !== '' || lines.length === 0) lines.push(line.replace(/\s+$/, ''));
    line = '';
  };
  for (const token of words) {
    if (token === '') continue;
    if (measure(line + token) <= maxW) {
      line += token;
      continue;
    }
    if (/^\s+$/.test(token)) {
      flush();
      continue;
    }
    if (line.trim() !== '') flush();
    // token longer than a line: break by characters
    if (measure(token) > maxW) {
      let chunk = '';
      for (const ch of Array.from(token)) {
        if (measure(chunk + ch) > maxW && chunk !== '') {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    } else line = token;
  }
  if (line !== '') lines.push(line);
  return lines;
}
