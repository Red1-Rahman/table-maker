import { SCHEMA_VERSION, type TableSchema } from '@/types/schema';
import { uid } from '@/utils/id';

export const DEFAULT_COL_WIDTH = 140;
export const DEFAULT_ROW_HEIGHT = 34;
export const MIN_COL_WIDTH = 24;
export const MIN_ROW_HEIGHT = 16;

export function createDefaultTable(opts: { rows?: number; cols?: number } = {}): TableSchema {
  const rows = opts.rows ?? 12;
  const cols = opts.cols ?? 5;
  return {
    id: uid('tbl'),
    title: 'Untitled table',
    version: SCHEMA_VERSION,
    aspectRatio: '1:sqrt2',
    dimensions: { columns: cols, rows },
    styles: {
      themeId: 'paper',
      zebra: true,
      headerRows: 1,
      cellPadding: 8,
      fontFamily: 'sans',
      fontSize: 14,
      gridColor: '',
      gridWidth: 1,
      gridStyle: 'solid',
    },
    canvas: { lockMode: 'autoscale', bg: '#ffffff', margin: 40, bleed: 12 },
    columns: Array.from({ length: cols }, () => ({ width: DEFAULT_COL_WIDTH })),
    rows: Array.from({ length: rows }, () => ({ height: DEFAULT_ROW_HEIGHT })),
    cells: {},
    mergedRanges: [],
    borders: {},
    conditionalRules: [],
    validations: [],
    filters: [],
    frozen: { rows: 0, cols: 0 },
  };
}

/** A small starter table so first-time users see something meaningful. */
export function createStarterTable(): TableSchema {
  const t = createDefaultTable({ rows: 8, cols: 4 });
  t.title = 'Linux distros for gaming';
  const data = [
    ['Distribution', 'Base', 'Gaming focus', 'Score'],
    ['Pop!_OS', 'Ubuntu', 'Good NVIDIA support', '9'],
    ['Nobara', 'Fedora', 'Pre-patched for games', '9'],
    ['Bazzite', 'Fedora Atomic', 'Console-like experience', '10'],
    ['SteamOS', 'Arch', 'Steam Deck', '10'],
    ['Linux Mint', 'Ubuntu', 'Stable general purpose', '7'],
    ['Average', '', '', '=ROUND(AVERAGE(D2:D6),1)'],
  ];
  data.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== '') t.cells[`${r}:${c}`] = { value: v, type: /^-?\d+(\.\d+)?$/.test(v) ? 'number' : 'text' };
    }),
  );
  t.columns[0].width = 170;
  t.columns[1].width = 150;
  t.columns[2].width = 230;
  t.columns[3].width = 100;
  for (let c = 0; c < 4; c++) t.cells[`6:${c}`] = { ...(t.cells[`6:${c}`] ?? { value: '', type: 'text' }), style: { bold: true } };
  return t;
}
