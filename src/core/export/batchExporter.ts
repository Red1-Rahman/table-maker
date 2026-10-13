import type { TableSchema } from '@/types/schema';
import { EXPORT_FORMATS, type ExportFormat, type ExportOptions, type ExportedFile } from '@/types/export';
import { strToU8, zipSync } from 'fflate';
import { exportCsv } from './csvExporter';
import { exportHtml } from './htmlExporter';
import { exportJson } from './jsonExporter';
import { exportMarkdown } from './markdownExporter';

export function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-');
  return (s || 'table').slice(0, 80);
}

/** Produces a single exported file. Heavy exporters are loaded lazily to keep the initial bundle small. */
export async function exportOne(doc: TableSchema, format: ExportFormat, opts: { baseName: string; pixelRatio: number }): Promise<ExportedFile> {
  const info = EXPORT_FORMATS.find((f) => f.id === format);
  if (!info) throw new Error(`Unknown format: ${format}`);
  const name = `${opts.baseName}.${info.ext}`;
  switch (format) {
    case 'csv':
      return { name, mime: info.mime, data: exportCsv(doc) };
    case 'md':
      return { name, mime: info.mime, data: exportMarkdown(doc) };
    case 'html':
      return { name, mime: info.mime, data: exportHtml(doc) };
    case 'json':
      return { name, mime: info.mime, data: exportJson(doc) };
    case 'xlsx': {
      const { exportXlsx } = await import('./excelExporter');
      return { name, mime: info.mime, data: exportXlsx(doc) };
    }
    case 'pdf': {
      const { exportPdf } = await import('./pdfExporter');
      return { name, mime: info.mime, data: await exportPdf(doc, { pixelRatio: opts.pixelRatio }) };
    }
    case 'png': {
      const { exportPng } = await import('./pngExporter');
      return { name, mime: info.mime, data: await exportPng(doc, opts.pixelRatio) };
    }
  }
}

/** Exports all selected formats concurrently. */
export async function exportBatch(doc: TableSchema, options: ExportOptions): Promise<ExportedFile[]> {
  const baseName = safeFileName(options.baseName || doc.title);
  const results = await Promise.all(options.formats.map((f) => exportOne(doc, f, { baseName, pixelRatio: options.pixelRatio })));
  if (options.zip && results.length > 1) {
    const entries: Record<string, Uint8Array> = {};
    for (const f of results) entries[f.name] = typeof f.data === 'string' ? strToU8(f.data) : f.data;
    return [{ name: `${baseName}.zip`, mime: 'application/zip', data: zipSync(entries, { level: 6 }) }];
  }
  return results;
}
