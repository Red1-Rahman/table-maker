import { describe, expect, it } from 'vitest';
import { cellToA1, colToLetters, lettersToCol, parseRange } from '@/core/engine/address';
import { FormulaErr, createEvaluator, shiftFormulaRefs, toStr } from '@/core/engine/formulaEngine';

function sheet(data: Record<string, string>) {
  const ev = createEvaluator((r, c) => data[cellToA1(r, c)]);
  return (ref: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref) as RegExpExecArray;
    return ev.get(Number(m[2]) - 1, lettersToCol(m[1]));
  };
}

describe('address helpers', () => {
  it('round-trips column letters', () => {
    for (const n of [0, 1, 25, 26, 27, 51, 52, 701, 702]) expect(lettersToCol(colToLetters(n))).toBe(n);
    expect(colToLetters(26)).toBe('AA');
  });
  it('parses ranges', () => {
    expect(parseRange('B2:A1')).toEqual({ r1: 0, c1: 0, r2: 1, c2: 1 });
    expect(parseRange('nope')).toBeNull();
  });
});

describe('formula engine', () => {
  const g = sheet({ A1: '1', A2: '2', A3: '3', A4: 'x', B1: '=SUM(A1:A3)', B2: '=A1+A2*A3', C1: '=IF(A1>0,"pos","neg")' });

  it('SUM / AVERAGE / MIN / MAX / COUNT', () => {
    const f = sheet({ A1: '10', A2: '20', A3: '', A4: 'text', B1: '=SUM(A1:A4)', B2: '=AVERAGE(A1:A4)', B3: '=MIN(A1:A4)', B4: '=MAX(A1:A4)', B5: '=COUNT(A1:A4)', B6: '=AVG(A1,A2)' });
    expect(f('B1')).toBe(30);
    expect(f('B2')).toBe(15);
    expect(f('B3')).toBe(10);
    expect(f('B4')).toBe(20);
    expect(f('B5')).toBe(2);
    expect(f('B6')).toBe(15);
  });
  it('arithmetic precedence & references', () => {
    expect(g('B1')).toBe(6);
    expect(g('B2')).toBe(7);
  });
  it('IF, CONCAT, ROUND, comparison, &', () => {
    expect(g('C1')).toBe('pos');
    const f = sheet({ A1: '2.345', B1: '=ROUND(A1,2)', B2: '=ROUND(-2.5)', B3: '=CONCAT("a",1,TRUE)', B4: '="x"&"y"', B5: '=IF(1<>1,1)', B6: '=2^3^2', B7: '=-2^2', B8: '=50%' });
    expect(f('B1')).toBe(2.35);
    expect(f('B2')).toBe(-3);
    expect(f('B3')).toBe('a1TRUE');
    expect(f('B4')).toBe('xy');
    expect(f('B5')).toBe(false);
    expect(f('B6')).toBe(512);
    expect(f('B8')).toBe(0.5);
  });
  it('errors', () => {
    const f = sheet({ A1: '=1/0', A2: '=B2', B2: '=A2', A3: '=NOPE(1)', A4: '=1+', A5: '=A1+1', A6: '="a"+1', A7: '=SUM(A1)' });
    expect((f('A1') as FormulaErr).code).toBe('#DIV/0!');
    expect((f('A2') as FormulaErr).code).toBe('#CYCLE!');
    expect((f('A3') as FormulaErr).code).toBe('#NAME?');
    expect(f('A4')).toBeInstanceOf(FormulaErr);
    expect((f('A5') as FormulaErr).code).toBe('#DIV/0!');
    expect((f('A6') as FormulaErr).code).toBe('#VALUE!');
    expect(toStr(f('A1'))).toBe('#DIV/0!');
  });
  it('nested formulas and dependencies', () => {
    const f = sheet({ A1: '5', A2: '=A1*2', A3: '=A2+A1', A4: '=SUM(A1:A3)', A5: '=ROUND(AVERAGE(A1:A3)/3,1)' });
    expect(f('A4')).toBe(5 + 10 + 15);
    expect(f('A5')).toBe(3.3);
  });
  it('avoids float noise', () => {
    const f = sheet({ A1: '=0.1+0.2' });
    expect(toStr(f('A1'))).toBe('0.3');
  });
});

describe('shiftFormulaRefs', () => {
  it('insert rows', () => {
    expect(shiftFormulaRefs('=A1+A5', 'row', 'insert', 2, 1)).toBe('=A1+A6');
    expect(shiftFormulaRefs('=SUM(A1:A5)', 'row', 'insert', 2, 2)).toBe('=SUM(A1:A7)');
  });
  it('delete rows', () => {
    expect(shiftFormulaRefs('=A3+A9', 'row', 'delete', 4, 2)).toBe('=A3+A7');
    expect(shiftFormulaRefs('=A5', 'row', 'delete', 4, 1)).toBe('=#REF!');
    expect(shiftFormulaRefs('=SUM(A1:A5)', 'row', 'delete', 2, 1)).toBe('=SUM(A1:A4)');
  });
  it('insert/delete columns and leaves strings alone', () => {
    expect(shiftFormulaRefs('=B1&"B1"', 'col', 'insert', 0, 1)).toBe('=C1&"B1"');
    expect(shiftFormulaRefs('=C1', 'col', 'delete', 0, 1)).toBe('=B1');
  });
  it('does not touch non-formulas', () => {
    expect(shiftFormulaRefs('A1', 'row', 'insert', 0, 1)).toBe('A1');
  });
});
