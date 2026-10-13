import { fontCss } from '@/core/engine/fonts';
import type { CellBox } from '@/core/engine/scene';
import { memo } from 'react';
import { ImageCell } from './ImageCell';

const ERR = /^#(REF!|DIV\/0!|NAME\?|VALUE!|CYCLE!|ERROR!)$/;
const JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

interface Props {
  box: CellBox;
  dx: number;
  dy: number;
  frozenEdgeRight: boolean;
  frozenEdgeBottom: boolean;
  isFrozen: boolean;
}

function decorate(text: string, list?: 'bullet' | 'number'): string {
  if (!list) return text;
  return text
    .split('\n')
    .map((l, i) => (list === 'bullet' ? `• ${l}` : `${i + 1}. ${l}`))
    .join('\n');
}

/** Dispatches to the right renderer for a cell: text, formula result, image, or checkbox. */
function CellRendererBase({ box, dx, dy, frozenEdgeRight, frozenEdgeBottom, isFrozen }: Props) {
  const { cell } = box;
  const st = cell.style;
  const shadows: string[] = [];
  if (frozenEdgeRight) shadows.push('2px 0 0 -1px rgba(23,32,46,.35)');
  if (frozenEdgeBottom) shadows.push('0 2px 0 -1px rgba(23,32,46,.35)');
  const isErr = cell.kind === 'text' && ERR.test(cell.text);
  return (
    <div
      data-cell=""
      data-r={box.r}
      data-c={box.c}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: st.bg,
        color: isErr ? '#b42318' : st.color,
        fontFamily: fontCss(st.fontFamily),
        fontSize: st.fontSize,
        fontWeight: st.bold ? 700 : 400,
        fontStyle: st.italic ? 'italic' : 'normal',
        textDecoration: [st.underline && 'underline', st.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
        textAlign: st.align,
        padding: st.padding,
        lineHeight: 1.3,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: JUSTIFY[st.valign],
        whiteSpace: st.wrap ? 'pre-wrap' : 'pre',
        overflowWrap: 'anywhere',
        transform: dx || dy ? `translate(${dx}px, ${dy}px)` : undefined,
        zIndex: isFrozen ? 2 : undefined,
        boxShadow: shadows.length ? shadows.join(',') : undefined,
      }}
    >
      {cell.bar && (
        <div
          style={{ position: 'absolute', left: 2, top: 3, bottom: 3, width: `calc((100% - 4px) * ${cell.bar.frac})`, background: cell.bar.color, pointerEvents: 'none' }}
        />
      )}
      {cell.kind === 'image' && cell.image ? (
        <ImageCell image={cell.image} />
      ) : cell.kind === 'checkbox' ? (
        <span
          data-checkbox=""
          role="checkbox"
          aria-checked={cell.checked}
          style={{
            alignSelf: st.align === 'left' ? 'flex-start' : st.align === 'right' ? 'flex-end' : 'center',
            width: 16,
            height: 16,
            border: `1.5px solid ${st.color}`,
            borderRadius: 3,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            lineHeight: 1,
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          {cell.checked ? '✓' : ''}
        </span>
      ) : (
        <span style={{ position: 'relative' }}>{decorate(cell.text, st.list)}</span>
      )}
    </div>
  );
}

export const CellRenderer = memo(CellRendererBase, (a, b) => a.dx === b.dx && a.dy === b.dy && a.isFrozen === b.isFrozen && a.frozenEdgeRight === b.frozenEdgeRight && a.frozenEdgeBottom === b.frozenEdgeBottom && sameBox(a.box, b.box));

function sameBox(a: CellBox, b: CellBox): boolean {
  if (a === b) return true;
  return (
    a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.cell.text === b.cell.text && a.cell.kind === b.cell.kind && a.cell.checked === b.cell.checked &&
    a.cell.image === b.cell.image && a.cell.bar?.frac === b.cell.bar?.frac && a.cell.bar?.color === b.cell.bar?.color &&
    JSON.stringify(a.cell.style) === JSON.stringify(b.cell.style)
  );
}
