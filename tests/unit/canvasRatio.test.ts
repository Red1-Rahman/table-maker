import { describe, expect, it } from 'vitest';
import { SQRT2, computeCanvasLayout, fitZoom, getPageSize, remainingRoom } from '@/core/engine/canvasRatio';
import { createDefaultTable } from '@/core/engine/defaults';

describe('canvasRatio', () => {
  it('portrait A-series is exactly 1:√2', () => {
    const { w, h } = getPageSize('1:sqrt2');
    expect(h / w).toBeCloseTo(SQRT2, 12);
  });
  it('landscape A-series is exactly √2:1', () => {
    const { w, h } = getPageSize('sqrt2:1');
    expect(w / h).toBeCloseTo(SQRT2, 12);
  });
  it('fixed ratios', () => {
    const a = getPageSize('16:9');
    expect(a.w / a.h).toBeCloseTo(16 / 9, 10);
    const b = getPageSize('4:3');
    expect(b.w / b.h).toBeCloseTo(4 / 3, 10);
    expect(getPageSize('1:1').w).toBe(getPageSize('1:1').h);
  });
  it('custom size is clamped', () => {
    expect(getPageSize('custom', { w: 10, h: 99999 })).toEqual({ w: 100, h: 8000 });
  });

  it('autoscale shrinks content to fit and never enlarges', () => {
    const doc = createDefaultTable();
    doc.canvas.lockMode = 'autoscale';
    const small = computeCanvasLayout(doc, 100, 100);
    expect(small.tableScale).toBe(1);
    const big = computeCanvasLayout(doc, 2000, 400);
    expect(big.tableScale).toBeCloseTo(big.availW / 2000, 10);
    expect(big.tableScale).toBeLessThan(1);
  });

  it('growth lock keeps page fixed and reports overflow / room', () => {
    const doc = createDefaultTable();
    doc.canvas.lockMode = 'growth';
    const l = computeCanvasLayout(doc, 500, 500);
    expect(l.overflow).toBe(false);
    expect(l.tableScale).toBe(1);
    expect(remainingRoom(l).w).toBeCloseTo(l.availW - 500);
    expect(computeCanvasLayout(doc, 5000, 10).overflow).toBe(true);
  });

  it('free mode grows the page in whole pages', () => {
    const doc = createDefaultTable();
    doc.canvas.lockMode = 'free';
    const base = computeCanvasLayout(doc, 100, 100);
    expect(base.pages).toBe(1);
    const tall = computeCanvasLayout(doc, 100, base.baseH * 2.2);
    expect(tall.pages).toBe(3);
    expect(tall.pageH).toBeCloseTo(base.baseH * 3, 8);
  });

  it('fitZoom stays within 10%–500%', () => {
    expect(fitZoom(800, 1100, 1200, 900)).toBeGreaterThan(0.1);
    expect(fitZoom(1, 1, 10000, 10000)).toBe(5);
    expect(fitZoom(100000, 100000, 100, 100)).toBe(0.1);
  });
});
