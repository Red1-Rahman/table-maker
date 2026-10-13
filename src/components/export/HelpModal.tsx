import { isMac } from '@/core/input/keyNormalizer';
import { useStore } from '@/store/tableStore';
import { Modal } from '../common/Modal';

export function HelpModal() {
  const open = useStore((s) => s.modal === 'help');
  const mod = isMac() ? '⌘' : 'Ctrl';
  const rows: [string, string][] = [
    ['Move / extend selection', 'Arrows / Shift + Arrows'],
    ['Edit cell / commit and move down', 'Enter or F2 / Enter'],
    ['New line inside a cell', 'Shift+Enter or Alt+Enter'],
    ['Next / previous cell', 'Tab / Shift+Tab'],
    ['Clear contents', 'Delete or Backspace'],
    ['Undo / Redo', `${mod}+Z / ${mod}+Shift+Z`],
    ['Copy / Cut / Paste', `${mod}+C / X / V (Excel & Sheets compatible)`],
    ['Bold / Italic / Underline', `${mod}+B / I / U`],
    ['Select all', `${mod}+A`],
    ['Save draft', `${mod}+S`],
    ['AI assistant', `${mod}+K`],
    ['Zoom', `${mod}+Scroll wheel`],
    ['Pan', 'Space + drag, or middle mouse drag'],
    ['Formulas', '=SUM(A1:A5)  AVERAGE/AVG  MIN  MAX  COUNT  CONCAT  IF  ROUND'],
  ];
  return (
    <Modal open={open} onClose={() => useStore.getState().openModal(null)} title="Help & shortcuts" description="Table Maker v1" width="max-w-xl">
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-b border-rule last:border-0">
              <td className="py-1.5 pr-4 text-ink-soft">{a}</td>
              <td className="py-1.5 font-mono text-[12px]">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-ink-soft">
        Drop a CSV / XLSX / JSON / Markdown file anywhere on the canvas to import it, or drop an image onto a cell. Right-click cells and headers for more actions; drag row/column headers to reorder.
      </p>
    </Modal>
  );
}
