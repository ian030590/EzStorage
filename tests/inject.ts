'use strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { Duplex } from 'node:stream';
interface RequestOptions { method?: string; headers?: Record<string, string>; body?: unknown }
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
interface Response<T> { status: number; text: string; body: T; cookie?: string; headers: { get(key: string): string } }

export default function inject<T>(app: Handler, url: string, options: RequestOptions = {}) {
  return new Promise<Response<T>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = new Duplex({ read() {}, write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }) as Socket;
    Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' });
    const req = new IncomingMessage(socket);
    req.url = url; req.method = options.method || 'GET'; req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1;
    req.headers = Object.fromEntries(Object.entries({ host: 'localhost', ...options.headers }).map(([key, value]) => [key.toLowerCase(), value]));
    const body = options.body === undefined ? null : JSON.stringify(options.body);
    if (body) { req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(body)); }
    const res = new ServerResponse(req); res.assignSocket(socket);
    socket.on('drain', () => res.emit('drain'));
    res.on('error', reject);
    res.on('finish', () => {
      const raw = Buffer.concat(chunks).toString(); const value = raw.slice(raw.indexOf('\r\n\r\n') + 4);
      const headers = { get: (key: string) => { const value = res.getHeader(key); return Array.isArray(value) ? value.join(', ') : String(value ?? ''); } };
      resolve({ status: res.statusCode, text: value, body: value && String(headers.get('content-type')).includes('application/json') ? JSON.parse(value) as T : (value || null) as T, cookie: headers.get('set-cookie')?.split(';')[0], headers });
      socket.destroy();
    });
    app(req, res);
    if (body) req.push(body); req.push(null);
  });
};
