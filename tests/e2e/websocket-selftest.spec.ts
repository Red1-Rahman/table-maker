import { expect, test } from '../fixtures/diagnostics';
import { startWsEchoServer } from '../fixtures/wsEchoServer';

/**
 * Self-test for the WebSocket collector in tests/fixtures/diagnostics.ts.
 *
 * The production build must open no sockets at all. That assertion is only meaningful if the
 * collector is proven to observe sockets when they exist, so this spec opens a real WebSocket to a
 * local echo server and checks that the collector recorded the handshake and the frames.
 *
 * The page is served by the echo server itself, not by the app: the production CSP has a narrow
 * `connect-src`, which would block the socket and hide the collector behind a console error.
 */
test.describe('websocket collector self-test', () => {
  test('records websocket, framesent and framereceived against a local echo server', async ({ page, diagnostics }) => {
    const server = await startWsEchoServer();
    try {
      diagnostics.allowWebsocket(server.url);
      diagnostics.allowOrigin(`http://127.0.0.1:${server.port}`);
      await page.goto(server.pageUrl);
      const echoed = await page.evaluate((url) => (window as never as { connectEcho: (u: string) => Promise<string> }).connectEcho(url), server.url);
      expect(echoed).toBe('echo:ping');

      const socket = diagnostics.sockets.find((s) => s.url.startsWith(server.url));
      expect(socket, `collector saw: ${JSON.stringify(diagnostics.sockets)}`).toBeTruthy();
      expect(socket?.framesSent).toBeGreaterThanOrEqual(1);
      expect(socket?.framesReceived).toBeGreaterThanOrEqual(1);
      expect(socket?.errors).toEqual([]);
      const state = await page.evaluate(() => (window as never as { __ws: { opened: boolean; received: string[] } }).__ws);
      expect(state.opened).toBe(true);
      expect(state.received).toEqual(['echo:ping']);
    } finally {
      await server.close();
    }
  });

  test('records the close event', async ({ page, diagnostics }) => {
    const server = await startWsEchoServer();
    try {
      diagnostics.allowWebsocket(server.url);
      diagnostics.allowOrigin(`http://127.0.0.1:${server.port}`);
      await page.goto(server.pageUrl);
      await page.evaluate((url) => (window as never as { connectEcho: (u: string) => Promise<string> }).connectEcho(url), server.url);
      await expect.poll(() => diagnostics.sockets.find((s) => s.url.startsWith(server.url))?.closed).toBe(true);
    } finally {
      await server.close();
    }
  });

  test('the app build itself opens no socket', async ({ page, diagnostics }) => {
    await page.goto('./');
    await expect(page.getByTestId('grid')).toBeVisible();
    expect(diagnostics.sockets).toHaveLength(0);
  });
});