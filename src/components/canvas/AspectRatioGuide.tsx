import type { CanvasLayout } from '@/core/engine/canvasRatio';

interface Props {
  layout: CanvasLayout;
  bleed: number;
  showMargins: boolean;
  showBleed: boolean;
  showPageBreaks: boolean;
  zoom: number;
}

/** Print guides drawn over the page: margins, bleed, page breaks and crop marks. Never exported. */
export function AspectRatioGuide({ layout, bleed, showMargins, showBleed, showPageBreaks, zoom }: Props) {
  const { pageW, pageH, margin, baseH, pages } = layout;
  const inv = 1 / zoom;
  const guide = '#d6336c';
  const marks = [
    [0, 0, -1, -1],
    [pageW, 0, 1, -1],
    [0, pageH, -1, 1],
    [pageW, pageH, 1, 1],
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }} aria-hidden data-testid="guides">
      {showMargins && margin > 0 && (
        <div style={{ position: 'absolute', left: margin, top: margin, right: margin, bottom: margin, border: `${inv}px dashed ${guide}`, opacity: 0.55 }} />
      )}
      {showBleed && bleed > 0 && (
        <div style={{ position: 'absolute', left: -bleed, top: -bleed, right: -bleed, bottom: -bleed, border: `${inv}px dotted ${guide}`, opacity: 0.7 }} />
      )}
      {showPageBreaks &&
        pages > 1 &&
        Array.from({ length: pages - 1 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: -bleed, right: -bleed, top: (i + 1) * baseH, borderTop: `${2 * inv}px dashed ${guide}` }}>
            <span style={{ position: 'absolute', right: 6, top: 4 * inv, fontSize: 11 * inv, color: guide, background: 'rgba(255,255,255,.85)', padding: `0 ${4 * inv}px` }}>
              page {i + 2} ↓
            </span>
          </div>
        ))}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {marks.map(([x, y, sx, sy], i) => (
          <g key={i} stroke="#17202e" strokeWidth={inv} opacity={0.55}>
            <line x1={x + sx * 4 * inv} y1={y} x2={x + sx * 14 * inv} y2={y} />
            <line x1={x} y1={y + sy * 4 * inv} x2={x} y2={y + sy * 14 * inv} />
          </g>
        ))}
      </svg>
    </div>
  );
}
