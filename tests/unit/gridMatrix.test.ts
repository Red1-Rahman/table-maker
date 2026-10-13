import { describe, expect, it } from 'vitest';
import { createDefaultTable } from '@/core/engine/defaults';
import { displayText } from '@/core/engine/evaluate';
import {
  applyBorders, applyStyle, deleteCols, deleteRows, findMerge, insertCols, insertRows, mergeRange,
  moveLine, pasteBlock, setCellValue, sortRows, toggleStyle, unmergeAt,
} from '@/core/engine/gridMatrix';
import { cellKey } from '@/types/schema';

const fresh = () => {
  const d = createDefaultTable({ rows: 5, cols: 4 });
  const data = [['h1', 'h2', 'h3', 'h4'], ['b', '2', '', ''], ['a', '1', '', ''], ['c', '3', '', ''], ['', '', '', '']];
  data.forEach((row, r) => row.forEach((v, c) => setCellValue(d, r, c, v)));
  return d;
};
const v = (d: ReturnType<typeof fresh>, r: number, c: number) => d.cells[cellKey(r, c)]?.value ?? '';

describe('cells', () => {
  it('infers types and prunes empties', () => {
    const d = fresh();
    expect(d.cells['1:1'].type).toBe('number');
    expect(d.cells['0:0'].type).toBe('text');
    setCellValue(d, 1, 1, '2024-03-01');
    expect(d.cells['1:1'].type).toBe('date');
    setCellValue(d, 1, 1, '');
    expect(d.cells['1:1']).toBeUndefined();
  });
});

describe('insert / delete', () => {
  it('inserts rows and shifts cells, sizes and formulas', () => {
    const d = fresh();
    setCellValue(d, 4, 1, '=SUM(B2:B4)');
    expect(insertRows(d, 2, 2)).toBe(true);
    expect(d.rows.length).toBe(7);
    expect(v(d, 1, 0)).toBe('b');
    expect(v(d, 4, 0)).toBe('a');
    expect(v(d, 6, 1)).toBe('=SUM(B2:B6)');
    expect(d.dimensions.rows).toBe(7);
    expect(displayText(d, 6, 1)).toBe('6');
  });
  it('deletes rows and columns', () => {
    const d = fresh();
    expect(deleteRows(d, 1, 1)).toBe(true);
    expect(v(d, 1, 0)).toBe('a');
    expect(deleteCols(d, 0, 1)).toBe(true);
    expect(v(d, 0, 0)).toBe('h2');
    expect(d.columns.length).toBe(3);
  });
  it('refuses to delete everything', () => {
    const d = createDefaultTable({ rows: 1, cols: 1 });
    expect(deleteRows(d, 0, 1)).toBe(false);
    expect(deleteCols(d, 0, 1)).toBe(false);
  });
  it('inserts columns', () => {
    const d = fresh();
    insertCols(d, 1, 1, 77);
    expect(d.columns[1].width).toBe(77);
    expect(v(d, 0, 2)).toBe('h2');
  });
  it('shifts borders, merges and validations with the data', () => {
    const d = fresh();
    mergeRange(d, { r1: 2, c1: 0, r2: 3, c2: 1 });
    applyBorders(d, { r1: 3, c1: 0, r2: 3, c2: 0 }, 'bottom', { width: 2, style: 'solid', color: '#000' });
    d.validations.push({ id: 'v', range: { r1: 3, c1: 1, r2: 3, c2: 1 }, type: 'number' });
    insertRows(d, 0, 1);
    expect(d.mergedRanges[0]).toMatchObject({ r1: 3, r2: 4 });
    expect(d.borders['h:5:0']).toBeDefined();
    expect(d.validations[0].range.r1).toBe(4);
    deleteRows(d, 3, 2);
    expect(d.mergedRanges.length).toBe(0);
  });
  it('merge expands when inserting inside it', () => {
    const d = fresh();
    mergeRange(d, { r1: 1, c1: 0, r2: 3, c2: 0 });
    insertRows(d, 2, 1);
    expect(d.mergedRanges[0]).toMatchObject({ r1: 1, r2: 4 });
  });
});

describe('merge / split', () => {
  it('merges keeping primary content, adopts donor when primary empty', () => {
    const d = fresh();
    mergeRange(d, { r1: 1, c1: 0, r2: 2, c2: 1 });
    expect(v(d, 1, 0)).toBe('b');
    expect(d.cells['2:0']).toBeUndefined();
    expect(findMerge(d, 2, 1)).toBeDefined();
    const e = fresh();
    mergeRange(e, { r1: 3, c1: 2, r2: 3, c2: 3 }); // all empty
    mergeRange(e, { r1: 3, c1: 0, r2: 3, c2: 2 });
    expect(e.mergedRanges.length).toBe(1);
    expect(unmergeAt(e, 3, 1)).toBe(true);
    expect(e.mergedRanges.length).toBe(0);
  });
});

describe('moving & sorting', () => {
  it('moves a row', () => {
    const d = fresh();
    expect(moveLine(d, 'row', 3, 1)).toBeNull();
    expect(v(d, 1, 0)).toBe('c');
    expect(v(d, 2, 0)).toBe('b');
    expect(d.rows.length).toBe(5);
  });
  it('moves a column', () => {
    const d = fresh();
    moveLine(d, 'col', 0, 2);
    expect(v(d, 0, 2)).toBe('h1');
    expect(v(d, 0, 0)).toBe('h2');
  });
  it('refuses to move across merges', () => {
    const d = fresh();
    mergeRange(d, { r1: 1, c1: 0, r2: 2, c2: 0 });
    expect(moveLine(d, 'row', 3, 0)).toMatch(/Unmerge/);
  });
  it('sorts excluding header, blanks last, numeric aware', () => {
    const d = fresh();
    expect(sortRows(d, 0, 'asc')).toBeNull();
    expect([1, 2, 3].map((r) => v(d, r, 0))).toEqual(['a', 'b', 'c']);
    expect(v(d, 1, 1)).toBe('1'); // row travelled together
    sortRows(d, 1, 'desc');
    expect([1, 2, 3].map((r) => v(d, r, 1))).toEqual(['3', '2', '1']);
    expect(v(d, 0, 0)).toBe('h1');
    expect(v(d, 4, 0)).toBe(''); // blank row stays last
  });
});

describe('styling', () => {
  it('applies, toggles and removes styles', () => {
    const d = fresh();
    applyStyle(d, { r1: 0, c1: 0, r2: 0, c2: 1 }, { bold: true, bg: '#fff000' });
    expect(d.cells['0:1'].style).toEqual({ bold: true, bg: '#fff000' });
    toggleStyle(d, { r1: 0, c1: 0, r2: 0, c2: 1 }, 'bold');
    expect(d.cells['0:1'].style).toEqual({ bg: '#fff000' });
    applyStyle(d, { r1: 4, c1: 3, r2: 4, c2: 3 }, { italic: true });
    applyStyle(d, { r1: 4, c1: 3, r2: 4, c2: 3 }, { italic: undefined });
    expect(d.cells['4:3']).toBeUndefined();
  });
  it('border modes', () => {
    const d = fresh();
    const spec = { width: 2, style: 'dashed' as const, color: '#f00' };
    applyBorders(d, { r1: 1, c1: 1, r2: 2, c2: 2 }, 'outer', spec);
    expect(Object.keys(d.borders).length).toBe(8);
    applyBorders(d, { r1: 1, c1: 1, r2: 2, c2: 2 }, 'inner', spec);
    expect(Object.keys(d.borders).length).toBe(12);
    applyBorders(d, { r1: 1, c1: 1, r2: 2, c2: 2 }, 'all', null);
    expect(Object.keys(d.borders).length).toBe(0);
  });
});

describe('paste', () => {
  it('pastes within bounds', () => {
    const d = fresh();
    pasteBlock(d, 3, 2, [[{ value: 'x' }, { value: 'y' }, { value: 'z' }], [{ value: '1' }, null, { value: '2' }]]);
    expect(v(d, 3, 2)).toBe('x');
    expect(v(d, 3, 3)).toBe('y');
    expect(v(d, 4, 2)).toBe('1');
  });
});
