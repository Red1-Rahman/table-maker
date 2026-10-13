import type { TableSchema } from '@/types/schema';
import { getExportMatrix } from './matrix';

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

export function matrixToMarkdown(values: string[][], aligns: ('left' | 'center' | 'right')[] = []): string {
  if (values.length === 0) return '';
  const cols = values[0].length;
  const header = values[0].map(esc);
  const sep = Array.from({ length: cols }, (_, i) => {
    const a = aligns[i];
    return a === 'center' ? ':---:' : a === 'right' ? '---:' : '---';
  });
  const lines = [`| ${header.join(' | ')} |`, `| ${sep.join(' | ')} |`];
  for (const row of values.slice(1)) lines.push(`| ${row.map(esc).join(' | ')} |`);
  return lines.join('\n');
}

export function exportMarkdown(doc: TableSchema): string {
  const { values, rowIndices } = getExportMatrix(doc);
  const aligns = values[0]?.map((_, c) => {
    const probe = rowIndices[Math.min(1, rowIndices.length - 1)];
    return doc.cells[`${probe}:${c}`]?.style?.align ?? 'left';
  });
  return `${matrixToMarkdown(values, aligns)}\n`;
}
