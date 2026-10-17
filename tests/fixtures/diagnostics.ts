/**
 * Reusable cross-browser diagnostics fixture.
 *
 * Every spec that imports `test` from this file gets these listeners for free. They collect the
 * same categories of signal a developer inspects in the DevTools network and console panels:
 *
 *   1. network   : every request, failed same-origin requests, requests to unexpected origins
 *   2. status    : same-origin response status codes (2xx/3xx and 304 only)
 *   3. console   : `error` and `warning` messages, unless allowlisted with a written reason
 *   4. pageerror : uncaught exceptions and unhandled promise rejections
 *   5. websocket : `websocket`, `framesent`, `framereceived`, `socketerror` and `close` events
 *
 * The assertions run automatically in fixture teardown, so a spec cannot forget them. The full
 * snapshot is attached to the test result as `diagnostics.json` for debugging.
 */
import {
  type Page,
  type Request as PWRequest,
  type Response as PWResponse,
  type TestInfo,
  type WebSocket as PWSocket,
  test as base,
} from '@playwright/test';

/** Origins the production build is allowed to talk to. `connect-src` in vite.config.ts lists the AI hosts. */
export const ORIGIN_ALLOWLIST: readonly string[] = [
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
  'https://api.anthropic.com',
];

export interface ConsoleAllowlistEntry {
  /** Substring or regular expression matched against the console text. */
  pattern: RegExp;
  /** Why the message is acceptable. Required: an entry without a reason is a bug. */
  reason: string;
  /** Browsers the entry applies to. `'*'` means every project. */
  browsers: readonly ('firefox' | 'webkit' | 'chromium' | '*')[];
}

/**
 * Documented console noise. Empty by default: the production build should be silent. When a browser
 * prints something unavoidable, add an entry here with the reason and the browsers it applies to,
 * never a blanket `ignore`.
 */
export const CONSOLE_ALLOWLIST: readonly ConsoleAllowlistEntry[] = [
  {
    pattern: /classified as a bounce tracker/,
    reason:
      'Firefox prints this warning from its own heuristics when a page is served from localhost (the vite preview server). ' +
      'It is emitted by the browser, not by the application, and cannot be suppressed from page code.',
    browsers: ['firefox'],
  },
];

export type DiagnosticCategory = 'network' | 'status' | 'console' | 'pageerror' | 'websocket';

export interface Problem {
  category: DiagnosticCategory;
  detail: string;
}

export interface RequestRecord {
  url: string;
  method: string;
  resourceType: string;
  sameOrigin: boolean;
  failed: boolean;
  failure: string | null;
  status: number | null;
  contentType: string | null;
}

export interface SocketRecord {
  url: string;
  framesSent: number;
  framesReceived: number;
  errors: string[];
  closed: boolean;
  allowed: boolean;
}

export interface DiagnosticsSnapshot {
  test: { title: string; project: string };
  requests: RequestRecord[];
  sockets: SocketRecord[];
  problems: Problem[];
}

const MAX_RECORDS = 500;

/** Expected Content-Type families for the asset kinds this app ships. */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.css': 'text/css',
  '.svg': 'image/svg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/',
  '.json': 'json',
  '.woff': 'font',
  '.woff2': 'font',
  '.html': 'text/html',
};

function truncate(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export class Diagnostics {
  readonly requests: RequestRecord[] = [];
  readonly problems: Problem[] = [];
  readonly sockets: SocketRecord[] = [];
  private readonly consoleMessages: { type: string; text: string; location: string }[] = [];
  private readonly pageErrors: string[] = [];
  private readonly allowedSockets: ((url: string) => boolean)[] = [];
  private readonly allowedConsole: ConsoleAllowlistEntry[] = [];
  private readonly extraOrigins: string[] = [];
  private readonly byRequest = new WeakMap<PWRequest, RequestRecord>();
  private readonly browserName: string;
  private origin: string;

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {
    this.browserName = testInfo.project.name;
    this.origin = new URL(testInfo.project.use.baseURL as string).origin;
  }

  /** Marks a WebSocket URL as expected for this test, so the socket self-test can use one. */
  allowWebsocket(match: string | RegExp): void {
    this.allowedSockets.push((url) => (typeof match === 'string' ? url.includes(match) : match.test(url)));
  }

  /**
   * Per-test console allowlist entry. Use it when the test itself provokes a browser message, for
   * example a mocked 401 response, and the reason has to travel with the test.
   */
  allowConsole(pattern: RegExp, reason: string): void {
    if (!reason.trim()) throw new Error('allowConsole needs a written reason');
    this.allowedConsole.push({ pattern, reason, browsers: ['*'] });
  }

  /** Adds an origin for this test only, for fixtures the test starts itself. */
  allowOrigin(origin: string): void {
    this.extraOrigins.push(origin);
  }

  /** Same-origin responses recorded so far, for specs that assert MIME types. */
  sameOriginResponses(): RequestRecord[] {
    return this.requests.filter((r) => r.sameOrigin);
  }

  attach(): void {
    this.page.on('request', (req) => this.onRequest(req));
    this.page.on('response', (res) => this.onResponse(res));
    this.page.on('requestfailed', (req) => this.onRequestFailed(req));
    this.page.on('websocket', (ws) => this.onWebSocket(ws));
    this.page.on('console', (msg) => this.onConsole(msg.type(), msg.text(), msg.location()));
    this.page.on('pageerror', (err) => this.onPageError(err));

    // Unhandled promise rejections do not surface as `pageerror` in every engine, so capture them.
    void this.page
      .addInitScript(() => {
        const w = window as unknown as { __tmUnhandledRejections?: string[] };
        w.__tmUnhandledRejections = [];
        window.addEventListener('unhandledrejection', (e) => {
          w.__tmUnhandledRejections?.push(String((e as PromiseRejectionEvent).reason?.stack ?? (e as PromiseRejectionEvent).reason));
        });
      })
      .catch(() => {
        /* the page may already be closed */
      });
  }

  private addProblem(category: DiagnosticCategory, detail: string): void {
    this.problems.push({ category, detail: truncate(detail, 800) });
  }

  private record(req: PWRequest): RequestRecord {
    const url = req.url();
    const entry: RequestRecord = {
      url,
      method: req.method(),
      resourceType: req.resourceType(),
      sameOrigin: isSameOrigin(url, this.origin),
      failed: false,
      failure: null,
      status: null,
      contentType: null,
    };
    this.byRequest.set(req, entry);
    this.requests.push(entry);
    if (this.requests.length > MAX_RECORDS) this.requests.shift();
    if (!entry.sameOrigin && !isIgnoredScheme(url) && !isAllowedOrigin(url, [...ORIGIN_ALLOWLIST, ...this.extraOrigins])) {
      this.addProblem('network', `request to non-allowlisted origin: ${req.method()} ${url} (${entry.resourceType})`);
    }
    return entry;
  }

  private onRequest(req: PWRequest): void {
    this.record(req);
  }

  private onResponse(res: PWResponse): void {
    const entry = this.byRequest.get(res.request());
    const status = res.status();
    const contentType = res.headers()['content-type'] ?? null;
    if (entry) {
      entry.status = status;
      entry.contentType = contentType;
    }
    const sameOrigin = isSameOrigin(res.url(), this.origin);
    if (sameOrigin && status >= 400 && status !== 304) {
      this.addProblem('status', `${status} ${res.url()} (resource type: ${res.request().resourceType()}, content-type: ${contentType ?? 'none'})`);
    }
    if (sameOrigin) this.assertMimeType(res.url(), contentType);
  }

  /**
   * A static host that answers every unknown path with `index.html` (which is what `vite preview`
   * does, and what a misconfigured Pages site does too) turns a missing asset into a 200 with the
   * wrong Content-Type instead of a 404. Comparing the served type with the file extension catches
   * that case, so a typo in an asset URL cannot slip through as a green test.
   */
  private assertMimeType(url: string, contentType: string | null): void {
    if (!contentType) return;
    const path = url.split(/[?#]/)[0].toLowerCase();
    const expected = Object.keys(MIME_BY_EXTENSION).find((ext) => path.endsWith(ext));
    if (!expected) return;
    const family = MIME_BY_EXTENSION[expected];
    if (contentType.includes(family)) return;
    this.addProblem(
      'status',
      `wrong MIME type: ${url} was served as "${contentType}" but a ${expected} file must be "${family}" ` +
        '(this is what a missing asset looks like when the host falls back to index.html)',
    );
  }

  private onRequestFailed(req: PWRequest): void {
    const entry = this.byRequest.get(req) ?? this.record(req);
    const failure = req.failure()?.errorText ?? 'unknown failure';
    entry.failed = true;
    entry.failure = failure;
    if (entry.sameOrigin) {
      this.addProblem('network', `same-origin request failed: ${req.method()} ${req.url()} (${entry.resourceType}): ${failure}`);
    }
  }

  private onConsole(type: string, text: string, location: { url: string }): void {
    this.consoleMessages.push({ type, text: truncate(text), location: location?.url ?? '' });
    if (type !== 'error' && type !== 'warning') return;
    const allowed = [...CONSOLE_ALLOWLIST, ...this.allowedConsole].find(
      (e) => e.pattern.test(text) && (e.browsers.includes('*') || e.browsers.includes(this.browserName as 'firefox')),
    );
    if (allowed) return;
    this.addProblem('console', `[${type}] ${truncate(text)}${location?.url ? ` (from ${location.url})` : ''}`);
  }

  private onPageError(err: Error): void {
    const message = err?.message ?? String(err);
    this.pageErrors.push(message);
    this.addProblem('pageerror', message);
  }

  private onWebSocket(ws: PWSocket): void {
    const allowed = this.allowedSockets.some((fn) => fn(ws.url()));
    const entry: SocketRecord = { url: ws.url(), framesSent: 0, framesReceived: 0, errors: [], closed: false, allowed };
    this.sockets.push(entry);
    ws.on('framesent', () => {
      entry.framesSent += 1;
    });
    ws.on('framereceived', () => {
      entry.framesReceived += 1;
    });
    ws.on('socketerror', (e) => {
      entry.errors.push(String(e));
      this.addProblem('websocket', `socket error on ${ws.url()}: ${e}`);
    });
    ws.on('close', () => {
      entry.closed = true;
    });
    if (!allowed) {
      this.addProblem('websocket', `unexpected WebSocket opened: ${ws.url()} (the production build must not open sockets)`);
    }
  }

  /** Reads the unhandled rejections captured by the init script. */
  async collectUnhandledRejections(): Promise<void> {
    const list = await this.page
      .evaluate(() => (window as unknown as { __tmUnhandledRejections?: string[] }).__tmUnhandledRejections ?? [])
      .catch(() => [] as string[]);
    for (const reason of list) this.addProblem('pageerror', `unhandled promise rejection: ${truncate(reason, 500)}`);
  }

  snapshot(): DiagnosticsSnapshot {
    return {
      test: { title: this.testInfo.title, project: this.browserName },
      requests: this.requests,
      sockets: this.sockets,
      problems: this.problems,
    };
  }

  /** Fails the test when anything was collected, with one readable block per category. */
  assertClean(): void {
    const problems = this.problems;
    if (problems.length === 0) return;
    const byCategory = new Map<DiagnosticCategory, string[]>();
    for (const p of problems) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p.detail]);
    const body = [...byCategory.entries()]
      .map(([category, details]) => [`[${category}]`, ...details.map((d) => `  - ${d}`)].join('\n'))
      .join('\n');
    throw new Error(`Browser diagnostics failed (${problems.length} problem(s)):\n${body}`);
  }

  async attachToResult(): Promise<void> {
    await this.testInfo.attach('diagnostics.json', {
      body: JSON.stringify(
        {
          ...this.snapshot(),
          consoleMessages: this.consoleMessages,
          pageErrors: this.pageErrors,
          consoleAllowlist: [...CONSOLE_ALLOWLIST, ...this.allowedConsole].map((e) => ({ pattern: String(e.pattern), reason: e.reason, browsers: e.browsers })),
          originAllowlist: ORIGIN_ALLOWLIST,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  }
}

function isSameOrigin(url: string, origin: string): boolean {
  return url.startsWith(origin);
}

function isIgnoredScheme(url: string): boolean {
  return /^(blob|data|about|javascript):/.test(url);
}

function isAllowedOrigin(url: string, allowlist: readonly string[]): boolean {
  return allowlist.some((o) => url === o || url.startsWith(`${o}/`));
}

export interface DiagnosticsFixtures {
  /** Auto fixture: listeners are attached before the first navigation and assertions run in teardown. */
  diagnostics: Diagnostics;
}

export const test = base.extend<DiagnosticsFixtures>({
  diagnostics: [
    async ({ page }, use, testInfo) => {
      const diagnostics = new Diagnostics(page, testInfo);
      diagnostics.attach();
      await use(diagnostics);
      await diagnostics.collectUnhandledRejections();
      try {
        diagnostics.assertClean();
      } finally {
        await diagnostics.attachToResult();
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';