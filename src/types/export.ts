export type ExportFormat = 'csv' | 'xlsx' | 'md' | 'html' | 'json' | 'pdf' | 'png';

export interface ExportFormatInfo {
  id: ExportFormat;
  label: string;
  ext: string;
  mime: string;
}

export const EXPORT_FORMATS: ExportFormatInfo[] = [
  { id: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8' },
  { id: 'xlsx', label: 'Excel', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { id: 'md', label: 'Markdown', ext: 'md', mime: 'text/markdown;charset=utf-8' },
  { id: 'html', label: 'HTML Table', ext: 'html', mime: 'text/html;charset=utf-8' },
  { id: 'json', label: 'JSON Data', ext: 'json', mime: 'application/json' },
  { id: 'pdf', label: 'PDF Document', ext: 'pdf', mime: 'application/pdf' },
  { id: 'png', label: 'PNG Image', ext: 'png', mime: 'image/png' },
];

export interface ExportOptions {
  formats: ExportFormat[];
  zip: boolean;
  baseName: string;
  pixelRatio: number; // PNG / raster PDF supersampling
}

export interface ExportedFile {
  name: string;
  mime: string;
  data: Uint8Array | string;
}
