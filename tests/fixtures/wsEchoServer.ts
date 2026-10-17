/**
 * Minimal RFC 6455 WebSocket echo server used by the WebSocket collector self-test.
 * No dependencies on purpose: the collector must be provable without pulling a package into CI.
 */
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OP_CONTINUATION = 0x0;
const OP_TEXT = 0x1;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

interface Frame {
  opcode: number;
  payload: Buffer;
  consumed: number;
}

/** Decodes one (possibly unmasked-on-server) client frame. Returns null when more bytes are needed. */
export function decodeFrame(buffer: Buffer): Frame | null {
  if (buffer.length < 2) return null;
  const fin = (buffer[0] & 0x80) !== 0;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let len = buffer[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length < offset + 2) return null;
    len = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (len === 127) {
    if (buffer.length < offset + 8) return null;
    len = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }
  const maskKey = masked ? buffer.subarray(offset, offset + 4) : null;
  if (masked) offset += 4;
  if (buffer.length < offset + len) return null;
  const payload = Buffer.from(buffer.subarray(offset, offset + len));
  if (maskKey) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
  void fin;
  void OP_CONTINUATION;
  return { opcode, payload, consumed: offset + len };
}

/** Encodes a server frame (never masked, per RFC 6455 section 5.1). */
export function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const header: number[] = [0x80 | opcode];
  if (payload.length < 126) header.push(payload.length);
  else if (payload.length < 65536) header.push(126, payload.length >> 8, payload.length & 0xff);
  else header.push(127, 0, 0, 0, 0, (payload.length >>> 24) & 0xff, (payload.length >>> 16) & 0xff, (payload.length >>> 8) & 0xff, payload.length & 0xff);
  return Buffer.concat([Buffer.from(header), payload]);
}

export interface WsEchoServer {
  url: string;
  /** Plain HTTP page on the same port. It carries no CSP, so the socket is not blocked by the app policy. */
  pageUrl: string;
  port: number;
  close: () => Promise<void>;
}

const ECHO_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>ws echo</title></head><body>
<script>
  window.__ws = { opened: false, sent: 0, received: [], closed: false, error: null };
  window.connectEcho = (url) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        window.__ws.opened = true;
        ws.send('ping');
      };
      ws.onmessage = (e) => {
        window.__ws.received.push(String(e.data));
        window.__ws.sent += 1;
        ws.close();
        resolve(String(e.data));
      };
      ws.onclose = () => {
        window.__ws.closed = true;
      };
      ws.onerror = () => {
        window.__ws.error = 'socket error';
        reject(new Error('socket error'));
      };
    });
</script></body></html>`;

export function startWsEchoServer(): Promise<WsEchoServer> {
  const server: Server = createServer((req, res) => {
    if ((req.url ?? '/').startsWith('/echo-page')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(ECHO_PAGE);
      return;
    }
    res.writeHead(426, { 'content-type': 'text/plain' });
    res.end('websocket upgrade required');
  });

  server.on('upgrade', (req, socket: Socket) => {
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let buffer = Buffer.alloc(0);
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const frame = decodeFrame(buffer);
        if (!frame) break;
        buffer = buffer.subarray(frame.consumed);
        if (frame.opcode === OP_CLOSE) {
          socket.end(encodeFrame(OP_CLOSE, Buffer.alloc(0)));
          return;
        }
        if (frame.opcode === OP_PING) {
          socket.write(encodeFrame(OP_PONG, frame.payload));
          continue;
        }
        if (frame.opcode === OP_TEXT) socket.write(encodeFrame(OP_TEXT, Buffer.from(`echo:${frame.payload.toString('utf8')}`)));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `ws://127.0.0.1:${port}`,
        pageUrl: `http://127.0.0.1:${port}/echo-page`,
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}