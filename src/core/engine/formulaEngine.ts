/**
 * Lightweight Excel-style formula engine (no React dependency).
 * Supports: + - * / ^ & % comparisons, A1 refs / ranges, and
 * SUM, AVERAGE (AVG), MIN, MAX, COUNT, COUNTA, CONCAT, IF, ROUND, ABS.
 */
import { colToLetters, lettersToCol } from './address';

export class FormulaErr {
  constructor(public code: '#REF!' | '#DIV/0!' | '#NAME?' | '#VALUE!' | '#CYCLE!' | '#ERROR!') {}
  toString() {
    return this.code;
  }
}

export type Scalar = number | string | boolean | FormulaErr;

// ---------------------------------------------------------------- tokenizer

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; r: number; c: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'end' };

const REF_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)/;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let s = '';
      i++;
      while (i < src.length) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          break;
        }
        s += src[i++];
      }
      if (src[i] !== '"') throw new FormulaErr('#ERROR!');
      i++;
      out.push({ t: 'str', v: s });
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new FormulaErr('#ERROR!');
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z$_]/.test(ch)) {
      const rest = src.slice(i);
      const refm = REF_RE.exec(rest);
      const after = refm ? rest[refm[0].length] : undefined;
      if (refm && !(after && /[A-Za-z0-9_(]/.test(after))) {
        out.push({ t: 'ref', r: Number(refm[2]) - 1, c: lettersToCol(refm[1]) });
        i += refm[0].length;
        continue;
      }
      const idm = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
      if (!idm) throw new FormulaErr('#ERROR!');
      out.push({ t: 'id', v: idm[0].toUpperCase() });
      i += idm[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>(),:%'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    throw new FormulaErr('#ERROR!');
  }
  out.push({ t: 'end' });
  return out;
}

// ------------------------------------------------------------------- parser

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; r: number; c: number }
  | { k: 'range'; r1: number; c1: number; r2: number; c2: number }
  | { k: 'un'; op: string; e: Node }
  | { k: 'pct'; e: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] };

const BIN_PREC: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5,
};

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}
  private peek() {
    return this.toks[this.p];
  }
  private next() {
    return this.toks[this.p++];
  }
  private isOp(v: string) {
    const t = this.peek();
    return t.t === 'op' && t.v === v;
  }
  parse(): Node {
    const n = this.expr(0);
    if (this.peek().t !== 'end') throw new FormulaErr('#ERROR!');
    return n;
  }
  private expr(minPrec: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t !== 'op' || !(t.v in BIN_PREC)) break;
      const prec = BIN_PREC[t.v];
      if (prec < minPrec) break;
      this.next();
      const right = this.expr(t.v === '^' ? prec : prec + 1);
      left = { k: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }
  private unary(): Node {
    if (this.isOp('-') || this.isOp('+')) {
      const op = (this.next() as { v: string }).v;
      return { k: 'un', op, e: this.unary() };
    }
    return this.postfix();
  }
  private postfix(): Node {
    let n = this.primary();
    while (this.isOp('%')) {
      this.next();
      n = { k: 'pct', e: n };
    }
    return n;
  }
  private primary(): Node {
    const t = this.next();
    switch (t.t) {
      case 'num':
        return { k: 'num', v: t.v };
      case 'str':
        return { k: 'str', v: t.v };
      case 'ref': {
        if (this.isOp(':')) {
          this.next();
          const t2 = this.next();
          if (t2.t !== 'ref') throw new FormulaErr('#ERROR!');
          return {
            k: 'range',
            r1: Math.min(t.r, t2.r), c1: Math.min(t.c, t2.c),
            r2: Math.max(t.r, t2.r), c2: Math.max(t.c, t2.c),
          };
        }
        return { k: 'ref', r: t.r, c: t.c };
      }
      case 'id': {
        if (this.isOp('(')) {
          this.next();
          const args: Node[] = [];
          if (!this.isOp(')')) {
            for (;;) {
              args.push(this.expr(0));
              if (this.isOp(',')) {
                this.next();
                continue;
              }
              break;
            }
          }
          if (!this.isOp(')')) throw new FormulaErr('#ERROR!');
          this.next();
          return { k: 'call', name: t.v, args };
        }
        if (t.v === 'TRUE') return { k: 'bool', v: true };
        if (t.v === 'FALSE') return { k: 'bool', v: false };
        throw new FormulaErr('#NAME?');
      }
      case 'op':
        if (t.v === '(') {
          const e = this.expr(0);
          if (!this.isOp(')')) throw new FormulaErr('#ERROR!');
          this.next();
          return e;
        }
        throw new FormulaErr('#ERROR!');
      default:
        throw new FormulaErr('#ERROR!');
    }
  }
}

const astCache = new Map<string, Node | FormulaErr>();

export function parseFormula(formula: string): Node {
  const src = formula.startsWith('=') ? formula.slice(1) : formula;
  let hit = astCache.get(src);
  if (!hit) {
    try {
      hit = new Parser(tokenize(src)).parse();
    } catch (e) {
      hit = e instanceof FormulaErr ? e : new FormulaErr('#ERROR!');
    }
    if (astCache.size > 5000) astCache.clear();
    astCache.set(src, hit);
  }
  if (hit instanceof FormulaErr) throw hit;
  return hit;
}

// ---------------------------------------------------------------- evaluator

export interface EvalContext {
  get(r: number, c: number): Scalar;
}

type Arg = Scalar | Scalar[];

const isErr = (v: unknown): v is FormulaErr => v instanceof FormulaErr;

function toNumber(v: Scalar): number | FormulaErr {
  if (isErr(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v.trim() === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? new FormulaErr('#VALUE!') : n;
}

export function toStr(v: Scalar): string {
  if (isErr(v)) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return formatNumber(v);
  return v;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '#DIV/0!' : '#VALUE!';
  const r = Number(n.toPrecision(12));
  return String(r);
}

function truthy(v: Scalar): boolean | FormulaErr {
  if (isErr(v)) return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = v.trim().toUpperCase();
  if (s === 'TRUE') return true;
  if (s === 'FALSE' || s === '') return false;
  const n = Number(s);
  return Number.isNaN(n) ? new FormulaErr('#VALUE!') : n !== 0;
}

function compare(a: Scalar, b: Scalar): number {
  const an = typeof a === 'number' || (typeof a === 'string' && a.trim() !== '' && !Number.isNaN(Number(a)));
  const bn = typeof b === 'number' || (typeof b === 'string' && b.trim() !== '' && !Number.isNaN(Number(b)));
  if (an && bn) return Number(a) - Number(b);
  const as = toStr(a).toLowerCase();
  const bs = toStr(b).toLowerCase();
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function collectNumbers(args: Arg[]): number[] | FormulaErr {
  const nums: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const v of a) {
        if (isErr(v)) return v;
        if (typeof v === 'number') nums.push(v);
        else if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) nums.push(Number(v));
      }
    } else {
      const n = toNumber(a);
      if (isErr(n)) return n;
      nums.push(n);
    }
  }
  return nums;
}

function evalNode(n: Node, ctx: EvalContext): Arg {
  switch (n.k) {
    case 'num':
    case 'str':
    case 'bool':
      return n.v;
    case 'ref':
      if (n.r < 0 || n.c < 0) return new FormulaErr('#REF!');
      return ctx.get(n.r, n.c);
    case 'range': {
      const out: Scalar[] = [];
      for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) out.push(ctx.get(r, c));
      return out;
    }
    case 'un': {
      const v = scalar(evalNode(n.e, ctx));
      const num = toNumber(v);
      if (isErr(num)) return num;
      return n.op === '-' ? -num : num;
    }
    case 'pct': {
      const num = toNumber(scalar(evalNode(n.e, ctx)));
      return isErr(num) ? num : num / 100;
    }
    case 'bin': {
      const a = scalar(evalNode(n.a, ctx));
      const b = scalar(evalNode(n.b, ctx));
      if (isErr(a)) return a;
      if (isErr(b)) return b;
      switch (n.op) {
        case '&':
          return toStr(a) + toStr(b);
        case '=':
          return compare(a, b) === 0;
        case '<>':
          return compare(a, b) !== 0;
        case '<':
          return compare(a, b) < 0;
        case '>':
          return compare(a, b) > 0;
        case '<=':
          return compare(a, b) <= 0;
        case '>=':
          return compare(a, b) >= 0;
      }
      const x = toNumber(a);
      const y = toNumber(b);
      if (isErr(x)) return x;
      if (isErr(y)) return y;
      switch (n.op) {
        case '+':
          return x + y;
        case '-':
          return x - y;
        case '*':
          return x * y;
        case '/':
          return y === 0 ? new FormulaErr('#DIV/0!') : x / y;
        case '^':
          return x ** y;
      }
      return new FormulaErr('#ERROR!');
    }
    case 'call':
      return callFn(n.name, n.args, ctx);
  }
}

function scalar(a: Arg): Scalar {
  if (Array.isArray(a)) return a.length ? a[0] : '';
  return a;
}

function callFn(name: string, argNodes: Node[], ctx: EvalContext): Arg {
  if (name === 'IF') {
    if (argNodes.length < 2 || argNodes.length > 3) return new FormulaErr('#VALUE!');
    const cond = truthy(scalar(evalNode(argNodes[0], ctx)));
    if (isErr(cond)) return cond;
    if (cond) return scalar(evalNode(argNodes[1], ctx));
    return argNodes[2] ? scalar(evalNode(argNodes[2], ctx)) : false;
  }
  const args = argNodes.map((a) => evalNode(a, ctx));
  switch (name) {
    case 'SUM': {
      const nums = collectNumbers(args);
      return isErr(nums) ? nums : nums.reduce((s, x) => s + x, 0);
    }
    case 'AVERAGE':
    case 'AVG': {
      const nums = collectNumbers(args);
      if (isErr(nums)) return nums;
      return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : new FormulaErr('#DIV/0!');
    }
    case 'MIN': {
      const nums = collectNumbers(args);
      return isErr(nums) ? nums : nums.length ? Math.min(...nums) : 0;
    }
    case 'MAX': {
      const nums = collectNumbers(args);
      return isErr(nums) ? nums : nums.length ? Math.max(...nums) : 0;
    }
    case 'COUNT': {
      let count = 0;
      for (const a of args) {
        const list = Array.isArray(a) ? a : [a];
        for (const v of list) {
          if (typeof v === 'number') count++;
          else if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) count++;
        }
      }
      return count;
    }
    case 'COUNTA': {
      let count = 0;
      for (const a of args) for (const v of Array.isArray(a) ? a : [a]) if (v !== '') count++;
      return count;
    }
    case 'CONCAT': {
      let s = '';
      for (const a of args)
        for (const v of Array.isArray(a) ? a : [a]) {
          if (isErr(v)) return v;
          s += toStr(v);
        }
      return s;
    }
    case 'ROUND': {
      if (args.length < 1 || args.length > 2) return new FormulaErr('#VALUE!');
      const x = toNumber(scalar(args[0]));
      const d = args[1] === undefined ? 0 : toNumber(scalar(args[1]));
      if (isErr(x)) return x;
      if (isErr(d)) return d;
      const f = 10 ** Math.trunc(d);
      return Math.sign(x) * Math.round(Math.abs(x) * f + Number.EPSILON) / f;
    }
    case 'ABS': {
      const x = toNumber(scalar(args[0] ?? ''));
      return isErr(x) ? x : Math.abs(x);
    }
    default:
      return new FormulaErr('#NAME?');
  }
}

/** Evaluate a formula string against a context. Never throws. */
export function evaluateFormula(formula: string, ctx: EvalContext): Scalar {
  try {
    const ast = parseFormula(formula);
    return scalar(evalNode(ast, ctx));
  } catch (e) {
    return e instanceof FormulaErr ? e : new FormulaErr('#ERROR!');
  }
}

export function parseLiteral(raw: string | undefined): Scalar {
  if (raw === undefined || raw === '') return '';
  const t = raw.trim();
  if (t !== '' && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return Number(t);
  const up = t.toUpperCase();
  if (up === 'TRUE') return true;
  if (up === 'FALSE') return false;
  return raw;
}

/** Memoising sheet evaluator with cycle detection. */
export function createEvaluator(getRaw: (r: number, c: number) => string | undefined) {
  const memo = new Map<string, Scalar>();
  const visiting = new Set<string>();
  const ctx: EvalContext = {
    get(r, c) {
      const key = `${r}:${c}`;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      const raw = getRaw(r, c);
      let val: Scalar;
      if (raw !== undefined && raw.startsWith('=') && raw.length > 1) {
        if (visiting.has(key)) return new FormulaErr('#CYCLE!');
        visiting.add(key);
        val = evaluateFormula(raw, ctx);
        visiting.delete(key);
      } else {
        val = parseLiteral(raw);
      }
      memo.set(key, val);
      return val;
    },
  };
  return ctx;
}

// -------------------------------------------- reference shifting (insert/delete)

const STRING_LIT = /"(?:[^"]|"")*"/g;
const RANGE_OR_REF = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?(?![A-Za-z0-9_(])/g;

function adjustIndex(i: number, mode: 'insert' | 'delete', at: number, count: number): number | null {
  if (mode === 'insert') return i >= at ? i + count : i;
  if (i >= at && i < at + count) return null;
  return i >= at + count ? i - count : i;
}

/** Rewrite A1 references in a formula after rows/columns were inserted or deleted. */
export function shiftFormulaRefs(
  formula: string,
  axis: 'row' | 'col',
  mode: 'insert' | 'delete',
  at: number,
  count: number,
): string {
  if (!formula.startsWith('=')) return formula;
  const pieces: string[] = [];
  let last = 0;
  const lits = [...formula.matchAll(STRING_LIT)];
  const rewrite = (seg: string) =>
    seg.replace(RANGE_OR_REF, (_m, d1, l1, d2, n1, d3, l2, d4, n2) => {
      const r1 = Number(n1) - 1;
      const c1 = lettersToCol(l1);
      if (l2 === undefined) {
        const idx = axis === 'row' ? r1 : c1;
        const ni = adjustIndex(idx, mode, at, count);
        if (ni === null) return '#REF!';
        const nr = axis === 'row' ? ni : r1;
        const nc = axis === 'col' ? ni : c1;
        return `${d1}${colToLetters(nc)}${d2}${nr + 1}`;
      }
      const r2 = Number(n2) - 1;
      const c2 = lettersToCol(l2);
      let lo = axis === 'row' ? Math.min(r1, r2) : Math.min(c1, c2);
      let hi = axis === 'row' ? Math.max(r1, r2) : Math.max(c1, c2);
      if (mode === 'insert') {
        if (lo >= at) lo += count;
        if (hi >= at) hi += count;
      } else {
        const end = at + count;
        if (lo >= at && hi < end) return '#REF!';
        if (lo >= at && lo < end) lo = at;
        else if (lo >= end) lo -= count;
        if (hi >= at && hi < end) hi = at - 1;
        else if (hi >= end) hi -= count;
      }
      const pr1 = axis === 'row' ? lo : Math.min(r1, r2);
      const pr2 = axis === 'row' ? hi : Math.max(r1, r2);
      const pc1 = axis === 'col' ? lo : Math.min(c1, c2);
      const pc2 = axis === 'col' ? hi : Math.max(c1, c2);
      return `${d1}${colToLetters(pc1)}${d2}${pr1 === undefined ? '' : pr1 + 1}:${d3}${colToLetters(pc2)}${d4}${pr2 + 1}`;
    });
  for (const m of lits) {
    const idx = m.index ?? 0;
    pieces.push(rewrite(formula.slice(last, idx)));
    pieces.push(m[0]);
    last = idx + m[0].length;
  }
  pieces.push(rewrite(formula.slice(last)));
  return pieces.join('');
}
