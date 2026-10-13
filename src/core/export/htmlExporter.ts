import { computeLayout } from '@/core/engine/layout';
import { fontCss } from '@/core/engine/fonts';
import { type CellBox, buildScene, resolveEdge } from '@/core/engine/scene';
import { getTheme } from '@/core/engine/themes';
import type { BorderSpec, TableSchema } from '@/types/schema';
import { escapeHtml, isSafeImageSrc, safeColor, sanitizeHtml } from '@/utils/sanitization';

const cssBorder = (spec: BorderSpec | null) => (spec ? `${spec.width}px ${spec.style} ${safeColor(spec.color, '#000')}` : 'none');

function cellHtml(doc: TableSchema, box: CellBox): string {
  const { cell } = box;
  const st = cell.style;
  const sides = [
    ['top', resolveEdge(doc, `h:${box.r}:${box.c}`)],
    ['bottom', resolveEdge(doc, `h:${box.r + box.rowSpan}:${box.c}`)],
    ['left', resolveEdge(doc, `v:${box.r}:${box.c}`)],
    ['right', resolveEdge(doc, `v:${box.r}:${box.c + box.colSpan}`)],
  ] as const;
  const css = [
    `background:${safeColor(st.bg, '#fff')}`,
    `color:${safeColor(st.color, '#000')}`,
    `font:${st.italic ? 'italic ' : ''}${st.bold ? 700 : 400} ${st.fontSize}px ${fontCss(st.fontFamily).replace(/"/g, "'")}`,
    `text-align:${st.align}`,
    `vertical-align:${st.valign}`,
    `padding:${st.padding}px`,
    `width:${box.w}px`,
    `height:${box.h}px`,
    `white-space:${st.wrap ? 'pre-wrap' : 'pre'}`,
    `overflow-wrap:anywhere`,
    ...(st.underline || st.strike ? [`text-decoration:${[st.underline && 'underline', st.strike && 'line-through'].filter(Boolean).join(' ')}`] : []),
    ...sides.map(([n, s]) => `border-${n}:${cssBorder(s)}`),
  ].join(';');
  const span = `${box.colSpan > 1 ? ` colspan="${box.colSpan}"` : ''}${box.rowSpan > 1 ? ` rowspan="${box.rowSpan}"` : ''}`;
  let inner = '';
  if (cell.kind === 'image' && cell.image && isSafeImageSrc(cell.image.src)) {
    const fit = { contain: 'contain', cover: 'cover', stretch: 'fill', original: 'none', center: 'none' }[cell.image.fitMode];
    inner = `<img src="${cell.image.src}" alt="${escapeHtml(cell.image.altText ?? '')}" style="display:block;width:100%;height:${Math.max(1, box.h - st.padding * 2)}px;object-fit:${fit};object-position:${cell.image.fitMode === 'original' ? 'left top' : 'center'}">`;
  } else if (cell.kind === 'checkbox') {
    inner = cell.checked ? '&#9745;' : '&#9744;';
  } else {
    const lines = cell.text.split(/\r?\n/);
    inner = lines
      .map((l, i) => escapeHtml(st.list === 'bullet' ? `• ${l}` : st.list === 'number' ? `${i + 1}. ${l}` : l))
      .join('\n');
  }
  return `<td${span} style="${css}">${inner}</td>`;
}

export function tableFragment(doc: TableSchema): string {
  const scene = buildScene(doc);
  const byRow = new Map<number, CellBox[]>();
  for (const b of scene.boxes) {
    const list = byRow.get(b.r) ?? [];
    list.push(b);
    byRow.set(b.r, list);
  }
  const { hidden } = computeLayout(doc);
  const cols = doc.columns.map((c) => `<col style="width:${c.width}px">`).join('');
  const rows: string[] = [];
  for (let r = 0; r < doc.rows.length; r++) {
    if (hidden.has(r)) continue;
    const boxes = (byRow.get(r) ?? []).sort((a, b) => a.c - b.c);
    rows.push(`<tr style="height:${doc.rows[r].height}px">${boxes.map((b) => cellHtml(doc, b)).join('')}</tr>`);
  }
  const total = doc.columns.reduce((s, c) => s + c.width, 0);
  return `<table style="border-collapse:collapse;table-layout:fixed;width:${total}px"><colgroup>${cols}</colgroup><tbody>${rows.join('')}</tbody></table>`;
}

export function exportHtml(doc: TableSchema): string {
  const fragment = sanitizeHtml(tableFragment(doc));
  const theme = getTheme(doc.styles.themeId);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)}</title>
<style>
  body { margin: 0; padding: 24px; background: ${safeColor(doc.canvas.bg, '#fff')}; color: ${theme.text}; }
  .tm-scroll { overflow-x: auto; }
  h1 { font: 600 20px ${fontCss('sans').replace(/"/g, "'")}; margin: 0 0 16px; }
</style>
</head>
<body>
<h1>${escapeHtml(doc.title)}</h1>
<div class="tm-scroll">
${fragment}
</div>
</body>
</html>
`;
}
