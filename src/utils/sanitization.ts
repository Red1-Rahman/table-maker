import DOMPurify from 'dompurify';

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|[a-z]{3,20})$/i;

/** Returns a safe CSS colour string or the fallback. Prevents CSS/attribute injection via imported files. */
export function safeColor(value: unknown, fallback = ''): string {
  return typeof value === 'string' && COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Sanitises untrusted HTML (clipboard paste / HTML export fragments). */
export function sanitizeHtml(html: string): string {
  try {
    if (typeof window === 'undefined') return html;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'caption', 'br', 'b', 'i', 'u', 's', 'strong', 'em', 'span', 'div', 'p', 'img', 'a'],
      ALLOWED_ATTR: ['style', 'colspan', 'rowspan', 'src', 'alt', 'href', 'width', 'height', 'title'],
      ALLOW_DATA_ATTR: false,
    });
  } catch {
    return escapeHtml(html);
  }
}

export const isSafeImageSrc = (src: unknown): src is string =>
  typeof src === 'string' && /^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(src);
