/**
 * Minimal, dependency-light XLSX writer (fflate for ZIP). Preserves values, formulas,
 * fills, fonts, alignment, borders, merges, column widths and frozen panes.
 */
import { colToLetters, cellToA1 } from '@/core/engine/address';
import { computeLayout } from '@/core/engine/layout';
import { resolveCell } from '@/core/engine/resolve';
import { resolveEdge } from '@/core/engine/scene';
import { cellValue } from '@/core/engine/evaluate';
import { FormulaErr } from '@/core/engine/formulaEngine';
import type { BorderSpec, TableSchema } from '@/types/schema';
import { cellKey } from '@/types/schema';
import { strToU8, zipSync } from 'fflate';

const xmlEsc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const argb = (hex: string) => `FF${hex.replace('#', '').padStart(6, '0').slice(0, 6).toUpperCase()}`;

class Registry {
  list: string[] = [];
  private map = new Map<string, number>();
  constructor(seed: string[] = []) {
    for (const s of seed) this.add(s);
  }
  add(xml: string): number {
    const hit = this.map.get(xml);
    if (hit !== undefined) return hit;
    this.list.push(xml);
    this.map.set(xml, this.list.length - 1);
    return this.list.length - 1;
  }
}

const borderXml = (sides: [string, BorderSpec | null][]) => {
  const side = (name: string, spec: BorderSpec | null) => {
    if (!spec) return `<${name}/>`;
    const style = spec.style === 'dashed' ? 'dashed' : spec.style === 'dotted' ? 'dotted' : spec.width <= 1 ? 'thin' : spec.width <= 2 ? 'medium' : 'thick';
    return `<${name} style="${style}"><color rgb="${argb(spec.color)}"/></${name}>`;
  };
  const m = new Map(sides);
  return `<border>${side('left', m.get('left') ?? null)}${side('right', m.get('right') ?? null)}${side('top', m.get('top') ?? null)}${side('bottom', m.get('bottom') ?? null)}<diagonal/></border>`;
};

export function exportXlsx(doc: TableSchema): Uint8Array {
  const { hidden } = computeLayout(doc);
  const rowMap = new Map<number, number>(); // original → 1-based exported row
  for (let r = 0; r < doc.rows.length; r++) if (!hidden.has(r)) rowMap.set(r, rowMap.size + 1);

  const fonts = new Registry(['<font><sz val="11"/><name val="Calibri"/></font>']);
  const fills = new Registry(['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']);
  const borders = new Registry(['<border><left/><right/><top/><bottom/><diagonal/></border>']);
  const xfs = new Registry(['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']);

  const writeAll = doc.rows.length * doc.columns.length <= 60_000;
  const rowsXml: string[] = [];

  for (const [r, outRow] of rowMap) {
    const cells: string[] = [];
    for (let c = 0; c < doc.columns.length; c++) {
      const cell = doc.cells[cellKey(r, c)];
      const rc = resolveCell(doc, r, c);
      const st = rc.style;
      const nonEmpty = !!cell && (cell.value !== '' || !!cell.imageConfig);
      if (!writeAll && !nonEmpty) continue;
      const fontId = fonts.add(
        `<font>${st.bold ? '<b/>' : ''}${st.italic ? '<i/>' : ''}${st.strike ? '<strike/>' : ''}${st.underline ? '<u/>' : ''}<sz val="${Math.round(st.fontSize * 0.75 * 10) / 10}"/><color rgb="${argb(st.color)}"/><name val="${st.fontFamily === 'serif' ? 'Cambria' : st.fontFamily === 'mono' ? 'Consolas' : 'Calibri'}"/></font>`,
      );
      const fillId = fills.add(`<fill><patternFill patternType="solid"><fgColor rgb="${argb(st.bg)}"/><bgColor indexed="64"/></patternFill></fill>`);
      // For merged non-origin cells, borders use their own positional edges
      const borderId = borders.add(
        borderXml([
          ['top', resolveEdge(doc, `h:${r}:${c}`)],
          ['bottom', resolveEdge(doc, `h:${r + 1}:${c}`)],
          ['left', resolveEdge(doc, `v:${r}:${c}`)],
          ['right', resolveEdge(doc, `v:${r}:${c + 1}`)],
        ]),
      );
      const xf = xfs.add(
        `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${st.align}" vertical="${st.valign === 'middle' ? 'center' : st.valign}"${st.wrap ? ' wrapText="1"' : ''}/></xf>`,
      );
      const ref = cellToA1(outRow - 1, c);
      let body = '';
      let t = '';
      if (cell && cell.value !== '') {
        const v = cellValue(doc, r, c);
        if (cell.type === 'image') {
          body = '';
        } else if (cell.value.startsWith('=') && cell.value.length > 1) {
          const f = cell.value.slice(1).replace(/\bAVG\(/gi, 'AVERAGE(');
          if (v instanceof FormulaErr) {
            t = ' t="e"';
            body = `<f>${xmlEsc(f)}</f><v>${xmlEsc(v.code)}</v>`;
          } else if (typeof v === 'number') body = `<f>${xmlEsc(f)}</f><v>${v}</v>`;
          else if (typeof v === 'boolean') {
            t = ' t="b"';
            body = `<f>${xmlEsc(f)}</f><v>${v ? 1 : 0}</v>`;
          } else {
            t = ' t="str"';
            body = `<f>${xmlEsc(f)}</f><v>${xmlEsc(String(v))}</v>`;
          }
        } else if (cell.type === 'number' && typeof v === 'number') body = `<v>${v}</v>`;
        else if (cell.type === 'boolean') {
          t = ' t="b"';
          body = `<v>${/^true$/i.test(cell.value) ? 1 : 0}</v>`;
        } else {
          t = ' t="inlineStr"';
          body = `<is><t xml:space="preserve">${xmlEsc(cell.value)}</t></is>`;
        }
      }
      cells.push(`<c r="${ref}" s="${xf}"${t}>${body}</c>`);
    }
    rowsXml.push(`<row r="${outRow}" ht="${Math.round(doc.rows[r].height * 0.75 * 100) / 100}" customHeight="1">${cells.join('')}</row>`);
  }

  // merges (mapped onto visible rows)
  const merges: string[] = [];
  for (const m of doc.mergedRanges) {
    const vis = [...rowMap.keys()].filter((r) => r >= m.r1 && r <= m.r2);
    if (!vis.length) continue;
    const r1 = rowMap.get(vis[0]) as number;
    const r2 = rowMap.get(vis[vis.length - 1]) as number;
    if (r1 === r2 && m.c1 === m.c2) continue;
    merges.push(`<mergeCell ref="${colToLetters(m.c1)}${r1}:${colToLetters(m.c2)}${r2}"/>`);
  }

  const cols = doc.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(2, Math.round((c.width / 7) * 100) / 100)}" customWidth="1"/>`).join('');
  const fr = doc.frozen;
  const pane =
    fr.rows || fr.cols
      ? `<sheetViews><sheetView workbookViewId="0"><pane${fr.cols ? ` xSplit="${fr.cols}"` : ''}${fr.rows ? ` ySplit="${fr.rows}"` : ''} topLeftCell="${colToLetters(fr.cols)}${fr.rows + 1}" activePane="${fr.rows && fr.cols ? 'bottomRight' : fr.rows ? 'bottomLeft' : 'topRight'}" state="frozen"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const landscape = doc.aspectRatio === 'sqrt2:1' || doc.aspectRatio === '16:9' || doc.aspectRatio === '4:3';

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rowsXml.join('')}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : ''}<pageSetup paperSize="9" orientation="${landscape ? 'landscape' : 'portrait'}"/></worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.list.length}">${fonts.list.join('')}</fonts><fills count="${fills.list.length}">${fills.list.join('')}</fills><borders count="${borders.list.length}">${borders.list.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.list.length}">${xfs.list.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(doc.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1')}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),
    'xl/styles.xml': strToU8(styles),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}
