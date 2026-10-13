import { fontCss } from '@/core/engine/fonts';
import type { ResolvedStyle } from '@/core/engine/resolve';
import { rulesForCell } from '@/core/engine/validation';
import { useStore } from '@/store/tableStore';
import { useEffect, useRef, useState } from 'react';

interface Props {
  r: number;
  c: number;
  initial: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style: ResolvedStyle;
}

/** Inline editor: plain text or formula. Becomes a dropdown when the cell has a "select" validation. */
export function CellEditor({ r, c, initial, x, y, w, h, style }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const [value, setValue] = useState(initial);
  const doc = useStore((s) => s.doc);
  const selectRule = rulesForCell(doc, r, c).find((v) => v.type === 'select');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const finish = (move?: { dr: number; dc: number }) => {
    if (done.current) return;
    done.current = true;
    const st = useStore.getState();
    const ok = st.commitEdit(value);
    if (!ok) {
      done.current = false;
      return;
    }
    if (move) st.moveSelection(move.dr, move.dc);
  };
  const cancel = () => {
    done.current = true;
    useStore.getState().cancelEdit();
  };

  if (selectRule) {
    return (
      <select
        autoFocus
        defaultValue={initial}
        style={{ position: 'absolute', left: x, top: y, width: w, height: h, zIndex: 6, fontSize: Math.min(style.fontSize, 16) }}
        onChange={(e) => {
          done.current = true;
          useStore.getState().setCellValue(r, c, e.target.value);
          useStore.getState().cancelEdit();
        }}
        onBlur={cancel}
        onKeyDown={(e) => e.key === 'Escape' && cancel()}
      >
        <option value="" />
        {(selectRule.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (done.current) return;
        const ok = useStore.getState().commitEdit(value);
        if (!ok) cancel();
        done.current = true;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') return cancel();
        if (e.key === 'Enter') {
          if (e.altKey) {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            setValue(`${value.slice(0, s)}\n${value.slice(el.selectionEnd)}`);
            requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1));
            return;
          }
          if (e.shiftKey) return; // newline
          e.preventDefault();
          return finish({ dr: 1, dc: 0 });
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          return finish({ dr: 0, dc: e.shiftKey ? -1 : 1 });
        }
      }}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: Math.max(w, 60),
        minHeight: h,
        height: h,
        zIndex: 6,
        boxSizing: 'border-box',
        resize: 'none',
        outline: '2px solid #2f5bea',
        border: 'none',
        background: '#fff',
        color: '#17202e',
        fontFamily: fontCss(style.fontFamily),
        fontSize: style.fontSize,
        fontWeight: style.bold ? 700 : 400,
        fontStyle: style.italic ? 'italic' : 'normal',
        textAlign: style.align,
        padding: style.padding,
        lineHeight: 1.3,
        boxShadow: '0 4px 14px rgba(23,32,46,.25)',
      }}
    />
  );
}
