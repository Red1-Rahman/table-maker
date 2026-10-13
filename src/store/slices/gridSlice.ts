import { applyAIResult } from '@/core/ai/prompt';
import { rangeCells } from '@/core/engine/address';
import { computeCanvasLayout, remainingRoom } from '@/core/engine/canvasRatio';
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, MIN_COL_WIDTH, MIN_ROW_HEIGHT, createDefaultTable, createStarterTable } from '@/core/engine/defaults';
import * as GM from '@/core/engine/gridMatrix';
import { computeLayout } from '@/core/engine/layout';
import { validateInput } from '@/core/engine/validation';
import type { AIResult } from '@/types/ai';
import type { CellAddress, Selection } from '@/types/events';
import {
  type AspectRatioId, type BorderSpec, type CanvasSettings, type CellRange, type CellStyle, type ConditionalRule, type FilterRule,
  type ImageConfig, type ImageFitMode, type TableGlobalStyles, type TableSchema, type ValidationRule, cellKey,
} from '@/types/schema';
import { uid } from '@/utils/id';
import { type Draft, type Patch, applyPatches, enablePatches, produceWithPatches } from 'immer';
import type { StateCreator } from 'zustand';
import { type HistoryEntry, pushHistory } from '../middleware/undoRedo';
import type { Store } from '../tableStore';

enablePatches();

export interface EditState {
  r: number;
  c: number;
  initial: string;
  /** true when started by typing (replace content), false for F2 / double-click (edit in place) */
  replace: boolean;
}

export interface InternalClip {
  tsv: string;
  cells: (GM.PasteCell | null)[][];
}

export interface CommitOptions {
  guardGrowth?: boolean;
}

export interface GridSlice {
  doc: TableSchema;
  selection: Selection;
  editing: EditState | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  clip: InternalClip | null;
  revision: number;

  commit: (recipe: (d: TableSchema) => string | void, opts?: CommitOptions) => boolean;
  undo: () => void;
  redo: () => void;
  loadDocument: (doc: TableSchema, opts?: { keepHistory?: boolean }) => void;
  newDocument: (opts?: { rows?: number; cols?: number; starter?: boolean }) => void;
  setTitle: (t: string) => void;

  select: (anchor: CellAddress, focus?: CellAddress) => void;
  selectRow: (r: number, extend?: boolean) => void;
  selectCol: (c: number, extend?: boolean) => void;
  selectAll: () => void;
  moveSelection: (dr: number, dc: number, extend?: boolean) => void;
  selectionRange: () => CellRange;

  startEdit: (r: number, c: number, initial?: string, replace?: boolean) => void;
  cancelEdit: () => void;
  commitEdit: (value: string) => boolean;
  setCellValue: (r: number, c: number, value: string) => boolean;
  toggleCheckbox: (r: number, c: number) => void;
  clearSelection: () => void;

  styleSelection: (patch: Partial<CellStyle>) => void;
  toggleStyle: (k: 'bold' | 'italic' | 'underline' | 'strike') => void;
  clearFormatting: () => void;
  bordersSelection: (mode: GM.BorderMode, spec: BorderSpec | null) => void;

  mergeSelection: () => void;
  unmergeSelection: () => void;
  insertRows: (at: number, count?: number) => void;
  insertCols: (at: number, count?: number) => void;
  deleteRows: (from: number, count?: number) => void;
  deleteCols: (from: number, count?: number) => void;
  moveLine: (axis: 'row' | 'col', from: number, to: number) => void;
  resizeCol: (c: number, w: number) => void;
  resizeRow: (r: number, h: number) => void;
  sortByColumn: (col: number, dir: 'asc' | 'desc') => void;
  setFrozen: (rows: number, cols: number) => void;

  setImage: (r: number, c: number, cfg: ImageConfig) => void;
  setImageFit: (fit: ImageFitMode) => void;

  setStyles: (patch: Partial<TableGlobalStyles>) => void;
  setCanvas: (patch: Partial<CanvasSettings>) => void;
  setAspectRatio: (id: AspectRatioId, custom?: { w: number; h: number }) => void;
  setConditionalRules: (rules: ConditionalRule[]) => void;
  setValidations: (rules: ValidationRule[]) => void;
  setFilters: (f: FilterRule[]) => void;

  copySelection: (cut?: boolean) => { text: string; cells: InternalClip['cells'] };
  pasteMatrix: (matrix: string[][], text?: string) => void;
  applyAI: (result: AIResult) => boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function expandForMerges(doc: TableSchema, rg: CellRange): CellRange {
  let cur = { ...rg };
  for (let i = 0; i < 10; i++) {
    let changed = false;
    for (const m of doc.mergedRanges) {
      if (m.r1 <= cur.r2 && m.r2 >= cur.r1 && m.c1 <= cur.c2 && m.c2 >= cur.c1) {
        const n = { r1: Math.min(cur.r1, m.r1), c1: Math.min(cur.c1, m.c1), r2: Math.max(cur.r2, m.r2), c2: Math.max(cur.c2, m.c2) };
        if (n.r1 !== cur.r1 || n.c1 !== cur.c1 || n.r2 !== cur.r2 || n.c2 !== cur.c2) {
          cur = n;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return cur;
}

export const selectionToRange = (doc: TableSchema, sel: Selection): CellRange =>
  expandForMerges(doc, {
    r1: Math.min(sel.anchor.r, sel.focus.r),
    c1: Math.min(sel.anchor.c, sel.focus.c),
    r2: Math.max(sel.anchor.r, sel.focus.r),
    c2: Math.max(sel.anchor.c, sel.focus.c),
  });

const initialDoc = createStarterTable();

export const createGridSlice: StateCreator<Store, [], [], GridSlice> = (set, get) => {
  const clampSel = (doc: TableSchema, sel: Selection): Selection => {
    const f = (a: CellAddress) => ({ r: clamp(a.r, 0, doc.rows.length - 1), c: clamp(a.c, 0, doc.columns.length - 1) });
    return { anchor: f(sel.anchor), focus: f(sel.focus) };
  };

  const sizeAfter = (doc: TableSchema) => {
    const l = computeLayout(doc);
    return computeCanvasLayout(doc, l.width, l.height);
  };

  return {
    doc: initialDoc,
    selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
    editing: null,
    past: [],
    future: [],
    clip: null,
    revision: 0,

    commit: (recipe, opts = {}) => {
      const prev = get().doc;
      let error: string | null = null;
      const [next, patches, inverse] = produceWithPatches(prev, (d: Draft<TableSchema>) => {
        const res = recipe(d as TableSchema);
        if (typeof res === 'string') error = res;
      });
      if (error) {
        get().toast(error, 'error');
        return false;
      }
      if (patches.length === 0) return false;
      if (opts.guardGrowth && next.canvas.lockMode === 'growth') {
        const before = sizeAfter(prev);
        const after = sizeAfter(next);
        if (after.overflow && (!before.overflow || after.tableW > before.tableW + 0.5 || after.tableH > before.tableH + 0.5)) {
          get().toast('The page is full. Switch to Autoscale or Free page mode to add more.', 'error');
          return false;
        }
      }
      set((s) => ({
        doc: next,
        past: pushHistory(s.past, { patches, inverse }),
        future: [],
        selection: clampSel(next, s.selection),
        revision: s.revision + 1,
      }));
      return true;
    },

    undo: () => {
      const { past, doc } = get();
      const entry = past[past.length - 1];
      if (!entry) return;
      const next = applyPatches(doc, entry.inverse);
      set((s) => ({ doc: next, past: s.past.slice(0, -1), future: [...s.future, entry], editing: null, selection: clampSel(next, s.selection), revision: s.revision + 1 }));
    },
    redo: () => {
      const { future, doc } = get();
      const entry = future[future.length - 1];
      if (!entry) return;
      const next = applyPatches(doc, entry.patches as Patch[]);
      set((s) => ({ doc: next, future: s.future.slice(0, -1), past: pushHistory(s.past, entry), editing: null, selection: clampSel(next, s.selection), revision: s.revision + 1 }));
    },

    loadDocument: (doc, opts) =>
      set((s) => ({
        doc,
        past: opts?.keepHistory ? s.past : [],
        future: [],
        editing: null,
        selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
        revision: s.revision + 1,
      })),
    newDocument: (opts = {}) => {
      const doc = opts.starter ? createStarterTable() : createDefaultTable({ rows: opts.rows, cols: opts.cols });
      get().loadDocument(doc);
    },
    setTitle: (t) => {
      get().commit((d) => {
        d.title = t.slice(0, 200);
      });
    },

    // ------------------------------------------------------------ selection
    select: (anchor, focus) => set((s) => ({ selection: clampSel(s.doc, { anchor, focus: focus ?? anchor }) })),
    selectRow: (r, extend) =>
      set((s) => ({
        selection: {
          anchor: extend ? { r: s.selection.anchor.r, c: 0 } : { r, c: 0 },
          focus: { r, c: s.doc.columns.length - 1 },
        },
      })),
    selectCol: (c, extend) =>
      set((s) => ({
        selection: {
          anchor: extend ? { r: 0, c: s.selection.anchor.c } : { r: 0, c },
          focus: { r: s.doc.rows.length - 1, c },
        },
      })),
    selectAll: () => set((s) => ({ selection: { anchor: { r: 0, c: 0 }, focus: { r: s.doc.rows.length - 1, c: s.doc.columns.length - 1 } } })),
    moveSelection: (dr, dc, extend) => {
      const { doc, selection } = get();
      const f = selection.focus;
      const m = GM.findMerge(doc, f.r, f.c);
      const base = {
        r: m && !extend ? (dr > 0 ? m.r2 : dr < 0 ? m.r1 : f.r) : f.r,
        c: m && !extend ? (dc > 0 ? m.c2 : dc < 0 ? m.c1 : f.c) : f.c,
      };
      const { hidden } = computeLayout(doc);
      let r = base.r + dr;
      while (dr !== 0 && hidden.has(r) && r > 0 && r < doc.rows.length - 1) r += dr;
      r = clamp(r, 0, doc.rows.length - 1);
      const c = clamp(base.c + dc, 0, doc.columns.length - 1);
      const target = extend ? { r, c } : GM.resolveOrigin(doc, r, c);
      set({ selection: { anchor: extend ? selection.anchor : target, focus: target } });
    },
    selectionRange: () => selectionToRange(get().doc, get().selection),

    // -------------------------------------------------------------- editing
    startEdit: (r, c, initial, replace = false) => {
      const { doc } = get();
      const o = GM.resolveOrigin(doc, r, c);
      const cell = doc.cells[cellKey(o.r, o.c)];
      if (cell?.type === 'image') return;
      set({
        editing: { r: o.r, c: o.c, initial: replace ? (initial ?? '') : (cell?.value ?? ''), replace },
        selection: { anchor: o, focus: o },
      });
    },
    cancelEdit: () => set({ editing: null }),
    commitEdit: (value) => {
      const ed = get().editing;
      if (!ed) return true;
      const ok = get().setCellValue(ed.r, ed.c, value);
      if (ok) set({ editing: null });
      return ok;
    },
    setCellValue: (r, c, value) => {
      const doc = get().doc;
      const existing = doc.cells[cellKey(r, c)]?.value ?? '';
      if (existing === value) return true;
      const v = validateInput(doc, r, c, value);
      if (!v.ok) {
        get().toast(v.message ?? 'Value not allowed here.', 'error');
        return false;
      }
      get().commit((d) => {
        GM.setCellValue(d, r, c, value);
      });
      return true;
    },
    toggleCheckbox: (r, c) => {
      const cur = /^true$/i.test(get().doc.cells[cellKey(r, c)]?.value ?? '');
      get().commit((d) => GM.setCheckbox(d, r, c, !cur));
    },
    clearSelection: () => {
      const rg = get().selectionRange();
      get().commit((d) => {
        GM.clearRange(d, rg, 'content');
      });
    },

    // -------------------------------------------------------------- styling
    styleSelection: (patch) => {
      const rg = get().selectionRange();
      get().commit((d) => GM.applyStyle(d, rg, patch));
    },
    toggleStyle: (k) => {
      const rg = get().selectionRange();
      get().commit((d) => GM.toggleStyle(d, rg, k));
    },
    clearFormatting: () => {
      const rg = get().selectionRange();
      get().commit((d) => GM.clearRange(d, rg, 'format'));
    },
    bordersSelection: (mode, spec) => {
      const rg = get().selectionRange();
      get().commit((d) => GM.applyBorders(d, rg, mode, spec));
    },

    // ------------------------------------------------------------ structure
    mergeSelection: () => {
      const rg = get().selectionRange();
      if (rangeCells(rg) < 2) return get().toast('Select two or more cells to merge.');
      get().commit((d) => {
        GM.mergeRange(d, rg);
      });
      get().select({ r: rg.r1, c: rg.c1 });
    },
    unmergeSelection: () => {
      const rg = get().selectionRange();
      get().commit((d) => {
        if (GM.unmergeRange(d, rg) === 0) return 'No merged cells in the selection.';
      });
    },
    insertRows: (at, count = 1) => {
      const { doc } = get();
      let h = doc.rows[Math.min(at, doc.rows.length - 1)]?.height ?? DEFAULT_ROW_HEIGHT;
      if (doc.canvas.lockMode === 'growth') {
        const l = sizeAfter(doc);
        const room = remainingRoom(l).h / count;
        if (room < MIN_ROW_HEIGHT) return get().toast('The page is full. Switch to Autoscale or Free page mode to add rows.', 'error');
        h = Math.min(h, Math.floor(room));
      }
      get().commit((d) => {
        if (!GM.insertRows(d, at, count, h)) return `Tables are limited to ${GM.MAX_ROWS} rows.`;
      }, { guardGrowth: true });
    },
    insertCols: (at, count = 1) => {
      const { doc } = get();
      let w = doc.columns[Math.min(at, doc.columns.length - 1)]?.width ?? DEFAULT_COL_WIDTH;
      if (doc.canvas.lockMode === 'growth') {
        const l = sizeAfter(doc);
        const room = remainingRoom(l).w / count;
        if (room < MIN_COL_WIDTH) return get().toast('The page is full. Switch to Autoscale or Free page mode to add columns.', 'error');
        w = Math.min(w, Math.floor(room));
      }
      get().commit((d) => {
        if (!GM.insertCols(d, at, count, w)) return `Tables are limited to ${GM.MAX_COLS} columns.`;
      }, { guardGrowth: true });
    },
    deleteRows: (from, count = 1) => {
      get().commit((d) => {
        if (!GM.deleteRows(d, from, count)) return 'A table needs at least one row.';
      });
    },
    deleteCols: (from, count = 1) => {
      get().commit((d) => {
        if (!GM.deleteCols(d, from, count)) return 'A table needs at least one column.';
      });
    },
    moveLine: (axis, from, to) => {
      get().commit((d) => GM.moveLine(d, axis, from, to) ?? undefined);
      set((s) => ({
        selection: axis === 'row'
          ? { anchor: { r: to, c: 0 }, focus: { r: to, c: s.doc.columns.length - 1 } }
          : { anchor: { r: 0, c: to }, focus: { r: s.doc.rows.length - 1, c: to } },
      }));
    },
    resizeCol: (c, w) => {
      const { doc } = get();
      let width = Math.max(MIN_COL_WIDTH, Math.round(w));
      if (doc.canvas.lockMode === 'growth') {
        const l = sizeAfter(doc);
        width = Math.min(width, doc.columns[c].width + Math.floor(remainingRoom(l).w));
      }
      get().commit((d) => GM.setColumnWidth(d, c, width));
    },
    resizeRow: (r, h) => {
      const { doc } = get();
      let height = Math.max(MIN_ROW_HEIGHT, Math.round(h));
      if (doc.canvas.lockMode === 'growth') {
        const l = sizeAfter(doc);
        height = Math.min(height, doc.rows[r].height + Math.floor(remainingRoom(l).h));
      }
      get().commit((d) => GM.setRowHeight(d, r, height));
    },
    sortByColumn: (col, dir) => {
      get().commit((d) => GM.sortRows(d, col, dir) ?? undefined);
    },
    setFrozen: (rows, cols) => {
      get().commit((d) => {
        d.frozen = { rows: clamp(rows, 0, d.rows.length - 1), cols: clamp(cols, 0, d.columns.length - 1) };
      });
    },

    // --------------------------------------------------------------- images
    setImage: (r, c, cfg) => {
      const { autoSizeImages } = get();
      get().commit((d) => {
        const o = GM.resolveOrigin(d, r, c);
        GM.setImage(d, o.r, o.c, cfg);
        if (autoSizeImages && !GM.findMerge(d, o.r, o.c) && cfg.naturalWidth && cfg.naturalHeight) {
          const w = d.columns[o.c].width - 4;
          d.rows[o.r].height = clamp(Math.round((w * cfg.naturalHeight) / cfg.naturalWidth) + 4, MIN_ROW_HEIGHT, 480);
        }
      }, { guardGrowth: true });
    },
    setImageFit: (fit) => {
      const rg = get().selectionRange();
      get().commit((d) => GM.forEachCell(rg, (r, c) => GM.setImageFit(d, r, c, fit)));
    },

    // ---------------------------------------------------- table-level props
    setStyles: (patch) => get().commit((d) => void Object.assign(d.styles, patch), { guardGrowth: false }),
    setCanvas: (patch) => get().commit((d) => void Object.assign(d.canvas, patch)),
    setAspectRatio: (id, custom) =>
      get().commit((d) => {
        d.aspectRatio = id;
        if (custom) {
          d.dimensions.customWidthPx = custom.w;
          d.dimensions.customHeightPx = custom.h;
        }
      }),
    setConditionalRules: (rules) => get().commit((d) => void (d.conditionalRules = rules)),
    setValidations: (rules) => get().commit((d) => void (d.validations = rules)),
    setFilters: (f) => get().commit((d) => void (d.filters = f)),

    // ------------------------------------------------------------ clipboard
    copySelection: () => {
      const { doc } = get();
      const rg = get().selectionRange();
      const cells: InternalClip['cells'] = [];
      const rows: string[][] = [];
      for (let r = rg.r1; r <= rg.r2; r++) {
        const cr: (GM.PasteCell | null)[] = [];
        const vr: string[] = [];
        for (let c = rg.c1; c <= rg.c2; c++) {
          const cell = doc.cells[cellKey(r, c)];
          cr.push(cell ? { value: cell.value, type: cell.type, style: cell.style, imageConfig: cell.imageConfig } : null);
          vr.push(cell?.type === 'image' ? '' : (cell?.value ?? ''));
        }
        cells.push(cr);
        rows.push(vr);
      }
      return { text: '', cells };
    },
    pasteMatrix: (matrix, text) => {
      const { doc, clip } = get();
      const rg = get().selectionRange();
      const rich = clip && text !== undefined && clip.tsv.replace(/\s+$/, '') === text.replace(/\r\n/g, '\n').replace(/\s+$/, '') ? clip.cells : null;
      const block: (GM.PasteCell | null)[][] = rich ?? matrix.map((row) => row.map((v) => ({ value: v })));
      if (block.length === 0) return;
      const single = block.length === 1 && block[0].length === 1;
      const target: CellRange = single
        ? rg
        : { r1: rg.r1, c1: rg.c1, r2: rg.r1 + block.length - 1, c2: rg.c1 + Math.max(...block.map((r) => r.length)) - 1 };
      const ok = get().commit((d) => {
        if (!GM.ensureSize(d, target.r2 + 1, target.c2 + 1)) return 'Paste is too large.';
        if (single) {
          GM.forEachCell(target, (r, c) => GM.pasteBlock(d, r, c, block));
        } else GM.pasteBlock(d, target.r1, target.c1, block);
      }, { guardGrowth: true });
      if (ok) get().select({ r: target.r1, c: target.c1 }, { r: target.r2, c: target.c2 });
      void doc;
    },

    applyAI: (result) => {
      if (!result.table) return false;
      const ok = get().commit((d) => {
        applyAIResult(d, result);
      });
      if (ok) {
        const l = sizeAfter(get().doc);
        if (l.overflow && get().doc.canvas.lockMode === 'growth') {
          get().commit((d) => {
            d.canvas.lockMode = 'autoscale';
          });
          get().toast('The new table is larger than the page, so Autoscale was turned on.');
        }
      }
      return ok;
    },
  };
};

export { uid };
