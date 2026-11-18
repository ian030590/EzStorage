'use strict';
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
module.exports = function inject(app, url, options = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const socket = new Duplex({ read() {}, write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    socket.remoteAddress = '127.0.0.1';
    const req = new IncomingMessage(socket);
    req.url = url; req.method = options.method || 'GET'; req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1;
    req.headers = Object.fromEntries(Object.entries({ host: 'localhost', ...options.headers }).map(([key, value]) => [key.toLowerCase(), value]));
    const body = options.body === undefined ? null : JSON.stringify(options.body);
    if (body) { req.headers['content-type'] = 'application/json'; req.headers['content-length'] = Buffer.byteLength(body); }
    const res = new ServerResponse(req); res.assignSocket(socket);
    socket.on('drain', () => res.emit('drain'));
    res.on('error', reject);
    res.on('finish', () => {
      const raw = Buffer.concat(chunks).toString(); const value = raw.slice(raw.indexOf('\r\n\r\n') + 4);
      const headers = { get: key => { const value = res.getHeader(key); return Array.isArray(value) ? value.join(', ') : value || null; } };
      resolve({ status: res.statusCode, text: value, body: value && String(headers.get('content-type')).includes('application/json') ? JSON.parse(value) : value || null, cookie: headers.get('set-cookie')?.split(';')[0], headers });
      socket.destroy();
    });
    app(req, res);
    if (body) req.push(body); req.push(null);
  });
};
