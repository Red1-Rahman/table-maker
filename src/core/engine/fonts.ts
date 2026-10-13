export interface FontInfo {
  id: string;
  label: string;
  css: string;
  /** built-in jsPDF font used for vector PDF export */
  pdf: 'helvetica' | 'times' | 'courier';
}

export const FONTS: FontInfo[] = [
  { id: 'sans', label: 'Sans', css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', pdf: 'helvetica' },
  { id: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", Times, serif', pdf: 'times' },
  { id: 'mono', label: 'Mono', css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace', pdf: 'courier' },
  { id: 'rounded', label: 'Rounded', css: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif', pdf: 'helvetica' },
  { id: 'display', label: 'Display', css: 'Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif', pdf: 'helvetica' },
];

export const fontInfo = (id?: string): FontInfo => FONTS.find((f) => f.id === id) ?? FONTS[0];
export const fontCss = (id?: string): string => fontInfo(id).css;
