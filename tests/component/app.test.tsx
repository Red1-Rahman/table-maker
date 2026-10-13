// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { createStarterTable } from '@/core/engine/defaults';
import { useStore } from '@/store/tableStore';

// jsdom has no PointerEvent: a MouseEvent subclass keeps button/clientX semantics
if (typeof window.PointerEvent === 'undefined') {
  (window as any).PointerEvent = class extends MouseEvent {};
}

beforeEach(() => {
  useStore.getState().loadDocument(createStarterTable());
  useStore.setState({ modal: null, toasts: [], aiBarOpen: false });
});
afterEach(cleanup);

const cell = (r: number, c: number) => document.querySelector(`[data-cell][data-r="${r}"][data-c="${c}"]`) as HTMLElement;

describe('App smoke', () => {
  it('renders the starter table with evaluated formulas', () => {
    render(<App />);
    expect(screen.getByText('Distribution')).toBeTruthy();
    expect(cell(6, 3).textContent).toBe('9');
    expect(screen.getByTestId('page-label').textContent).toContain('A · portrait');
  });

  it('selects on click and shows the address and formula', () => {
    render(<App />);
    fireEvent.pointerDown(cell(1, 3), { button: 0 });
    expect(screen.getByTestId('address').textContent).toBe('D2');
    expect((screen.getByTestId('formula-input') as HTMLInputElement).value).toBe('9');
    fireEvent.pointerDown(cell(6, 3), { button: 0 });
    expect((screen.getByTestId('formula-input') as HTMLInputElement).value).toBe('=ROUND(AVERAGE(D2:D6),1)');
  });

  it('edits through the formula bar and recalculates', () => {
    render(<App />);
    fireEvent.pointerDown(cell(1, 3), { button: 0 });
    const input = screen.getByTestId('formula-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '19' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().doc.cells['1:3'].value).toBe('19');
    expect(cell(6, 3).textContent).toBe('11');
  });

  it('typing starts inline edit, Enter commits and undo reverts', () => {
    render(<App />);
    fireEvent.pointerDown(cell(2, 0), { button: 0 });
    fireEvent.keyDown(window, { key: 'x' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    fireEvent.change(ta, { target: { value: 'xyz' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(useStore.getState().doc.cells['2:0'].value).toBe('xyz');
    act(() => useStore.getState().undo());
    expect(useStore.getState().doc.cells['2:0'].value).toBe('Nobara');
  });

  it('Ctrl+B toggles bold on the selection', () => {
    render(<App />);
    fireEvent.pointerDown(cell(1, 0), { button: 0 });
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(useStore.getState().doc.cells['1:0'].style?.bold).toBe(true);
  });

  it('growth lock blocks rows that do not fit; autoscale allows them', () => {
    render(<App />);
    act(() => {
      useStore.getState().setCanvas({ lockMode: 'growth' });
      for (let i = 0; i < 40; i++) useStore.getState().insertRows(0);
    });
    const rows = useStore.getState().doc.rows.length;
    expect(rows).toBeLessThan(48);
    expect(useStore.getState().toasts.some((t) => /full/i.test(t.text))).toBe(true);
    act(() => {
      useStore.getState().setCanvas({ lockMode: 'autoscale' });
      useStore.getState().insertRows(0, 5);
    });
    expect(useStore.getState().doc.rows.length).toBe(rows + 5);
  });

  it('opens the export modal with all formats checked', async () => {
    render(<App />);
    act(() => useStore.getState().openModal('export'));
    expect(await screen.findByText('Download selected')).toBeTruthy();
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked).length).toBeGreaterThanOrEqual(7);
  });

  it('key manager stores keys and priority order', () => {
    render(<App />);
    act(() => useStore.getState().openModal('keys'));
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: 'sk-test' } });
    expect(useStore.getState().ai.providers[0].apiKey).toBe('sk-test');
    act(() => useStore.getState().moveProvider('openai', 1));
    expect(useStore.getState().ai.providers[1].id).toBe('openai');
  });

  it('sorting, merging and conditional highlight render', () => {
    render(<App />);
    act(() => {
      useStore.getState().sortByColumn(3, 'desc');
      useStore.getState().setConditionalRules([{ id: 'c', range: { r1: 1, c1: 3, r2: 5, c2: 3 }, op: 'gt', value: '9', style: { bg: '#ff0000' } }]);
    });
    expect(cell(1, 3).style.background).toMatch(/rgb\(255, 0, 0\)|#ff0000/);
    act(() => {
      useStore.getState().select({ r: 0, c: 0 }, { r: 0, c: 1 });
      useStore.getState().mergeSelection();
    });
    expect(useStore.getState().doc.mergedRanges).toHaveLength(1);
  });
});
