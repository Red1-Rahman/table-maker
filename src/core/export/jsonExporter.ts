import type { TableSchema } from '@/types/schema';
import { getExportMatrix } from './matrix';

export interface JsonEnvelope {
  format: 'table-maker';
  version: string;
  title: string;
  /** plain 2-D computed values (formulas evaluated) */
  data: string[][];
  /** lossless document, re-importable */
  document: TableSchema;
}

export function exportJson(doc: TableSchema): string {
  const env: JsonEnvelope = {
    format: 'table-maker',
    version: doc.version,
    title: doc.title,
    data: getExportMatrix(doc).values,
    document: doc,
  };
  return JSON.stringify(env, null, 2);
}
