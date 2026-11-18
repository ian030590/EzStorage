import express from 'express';
import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import qr from 'qrcode';
import { createRequire } from 'node:module';
import createEngine from '../shared/engine.ts';
import { changeCatalog, currentParts, email, fail, mailView, perform, respondToMail, text, view } from '../shared/api.ts';
import type { Catalog, Person, Receipt, Snapshot, User } from '../shared/model.ts';
import { password, hashPassword, verifyPassword } from './auth.ts';
import seed from './seed.json' with { type: 'json' };

interface StoredUser extends User { password: string }
type Options = Record<string, unknown> & {
  now?: () => Date; scheduler?: boolean;
  transport?: { sendMail(message: { from?: string; to: string; subject: string; text: string }): Promise<unknown> };
};
declare module 'express' { interface Request { user: StoredUser | null } }

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const clone = structuredClone;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function createApp(options: Options = {}) {
  const config = { ...process.env, ...options } as NodeJS.ProcessEnv;
  const dbPath = config.DATABASE_PATH || path.join(ROOT, 'data/ezstorage.sqlite');
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS application (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  const now = () => options.now ? options.now() : new Date();
  const current = () => currentParts(now());
  if (!db.prepare('SELECT 1 FROM users WHERE role=?').get('admin')) {
    const adminPassword = password(config.ADMIN_PASSWORD);
    if (adminPassword === 'replace-with-a-long-random-password') fail('請先更換 ADMIN_PASSWORD 範例密碼。');
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(randomUUID(), email(config.ADMIN_EMAIL || 'admin@example.com'), '管理者', hashPassword(adminPassword), 'admin');
  }
  if (!db.prepare('SELECT 1 FROM application').get()) {
    const data: Catalog = config.SEED_DEMO === 'true' ? clone({ ...seed, today: current().today }) : { ...clone({ ...seed, today: current().today }), rooms: [{ id: '1', name: '第一個房間' }], units: [], items: [], people: [], records: [] }; data.today = current().today;
    if (config.SEED_DEMO === 'true') data.rooms.forEach(room => { room.name = '示範｜' + room.name; });
    const engine = createEngine(data);
    // shortcut: workflow state is one transactional SQLite document; normalize before multiple app replicas or large histories.
    db.prepare('INSERT INTO application VALUES (1, ?)').run(JSON.stringify({ data, state: engine.state, revision: 0, lastDaily: null }));
  }
  const read = () => JSON.parse(db.prepare('SELECT json FROM application WHERE id=1').get()!.json as string) as Snapshot;
  const save = (snapshot: Snapshot) => db.prepare('UPDATE application SET json=? WHERE id=1').run(JSON.stringify(snapshot));
  function transaction<T>(callback: (snapshot: Snapshot) => T): T {
    db.exec('BEGIN IMMEDIATE');
    try { const snapshot = read(); const result = callback(snapshot); snapshot.revision++; save(snapshot); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function engineFor(snapshot: Snapshot) {
    snapshot.data.today = snapshot.state.today = current().today;
    snapshot.data.people = db.prepare('SELECT id,name,email FROM users').all() as unknown as Person[];
    return createEngine(snapshot.data, snapshot.state);
  }
  function snapshotView(user: User | null, result?: Receipt) {
    const snapshot = read();
    engineFor(snapshot);
    return view(snapshot, user, config.ALLOW_REGISTRATION === 'true', result);
  }
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      let origin; try { origin = new URL(req.headers.origin).origin; } catch { return next(Object.assign(new Error('來源網址無效。'), { status: 403 })); }
      const allowed = config.PUBLIC_URL ? new URL(config.PUBLIC_URL).origin : req.protocol + '://' + req.headers.host;
      if (origin !== allowed) return next(Object.assign(new Error('此來源無法執行操作。'), { status: 403 }));
    }
    next();
  });
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PATCH'].includes(req.method) && req.path !== '/logout' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(Object.assign(new Error('請傳送 JSON 物件。'), { status: 400 }));
    next();
  });
  app.use((req, _res, next) => {
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim().split('=')));
    const session = cookies.ezstorage_session && db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(digest(cookies.ezstorage_session), now().getTime());
    req.user = (session || null) as StoredUser | null;
    next();
  });
  const auth: RequestHandler = (req, _res, next) => { if (!req.user) return next(Object.assign(new Error('請先登入。'), { status: 401 })); next(); };
  const admin: RequestHandler = (req, res, next) => auth(req, res, error => { if (error) return next(error); if (req.user!.role !== 'admin') return next(Object.assign(new Error('只有管理者能編輯房間與物品。'), { status: 403 })); next(); });
  const cookieOptions: CookieOptions & { maxAge: number } = { httpOnly: true, sameSite: 'strict', secure: config.COOKIE_SECURE === 'true', path: '/', maxAge: 7 * 86400000 };
  function loginUser(res: Response, user: User) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now().getTime());
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), user.id, now().getTime() + cookieOptions.maxAge);
    res.cookie('ezstorage_session', token, cookieOptions);
  }
  const attempts = new Map<string | undefined, { count: number; expires: number }>();
  function throttle(req: Request) {
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, expires: now().getTime() + 15 * 60000 };
    if (entry.expires < now().getTime()) { entry.count = 0; entry.expires = now().getTime() + 15 * 60000; }
    if (++entry.count > 20) fail('嘗試次數過多，請在 15 分鐘後再試。', 429);
    attempts.set(key, entry);
  }
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/state', (req, res) => res.json(snapshotView(req.user)));
  app.post('/api/login', (req, res) => {
    throttle(req);
    const address = email(req.body.email);
    if (typeof req.body.password !== 'string' || req.body.password.length > 128) fail('帳號或密碼不正確。', 401);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(address) as unknown as StoredUser | undefined;
    if (!user || !verifyPassword(req.body.password, user.password)) fail('帳號或密碼不正確。', 401);
    loginUser(res, user); res.json(snapshotView(user));
  });
  app.post('/api/register', (req, res) => {
    if (config.ALLOW_REGISTRATION !== 'true') fail('目前未開放自行註冊，請聯絡管理者。', 403);
    throttle(req);
    const address = email(req.body.email), name = text(req.body.name, '姓名', 80), secret = hashPassword(password(req.body.password));
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(address)) fail('這個 Email 已註冊。', 409);
    const user = { id: randomUUID(), email: address, name, role: 'borrower' };
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(user.id, address, name, secret, user.role);
    loginUser(res, user); res.status(201).json(snapshotView(user));
  });
  app.post('/api/logout', (req, res) => {
    const token = (req.headers.cookie || '').match(/(?:^|;\s*)ezstorage_session=([^;]+)/)?.[1];
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
    res.clearCookie('ezstorage_session', cookieOptions); res.json(snapshotView(null));
  });
  app.post('/api/actions', auth, (req, res) => {
    const result = transaction(snapshot => perform(engineFor(snapshot), req.user!, req.body.action, req.body.args));
    res.json(snapshotView(req.user, result));
  });
  function change(req: Request, res: Response) {
    transaction(snapshot => changeCatalog(engineFor(snapshot), req.method, req.path, req.body, req.user!, snapshot.revision));
    res.json(snapshotView(req.user));
  }
  const catalogRoutes = { rooms: 'id', units: 'code', items: 'id' };
  for (const [section, parameter] of Object.entries(catalogRoutes)) {
    app.post('/api/' + section, admin, change);
    app.patch('/api/' + section + '/:' + parameter, admin, change);
  }
  app.get('/api/qr.svg', async (req, res) => {
    const value = text(req.query.text, 'QR Code 內容', 2048);
    const svg = await qr.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    res.type('image/svg+xml').send(svg);
  });
  app.get('/api/mail-actions/:token', (req, res) => {
    const snapshot = read();
    res.json(mailView(engineFor(snapshot), snapshot, req.params.token, now()));
  });
  app.post('/api/mail-actions/:token', (req, res) => {
    const result = transaction(snapshot => respondToMail(engineFor(snapshot), snapshot, req.params.token, req.body, now(),
      id => db.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as StoredUser | undefined));
    res.json({ result });
  });
  app.use(express.static(path.join(ROOT, 'dist'), { index: 'index.html' }));
  app.use('/api', (_req, res) => res.status(404).json({ error: '找不到 API。' }));
  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? '系統暫時無法處理，請稍後重試。' : error.message });
  });
  function runDaily() {
    const time = current();
    if (time.hour < 8 || read().lastDaily === time.today) return;
    transaction(snapshot => { const engine = engineFor(snapshot); engine.daily(time.today); snapshot.lastDaily = time.today; });
  }
  let sending = false;
  const transport: Options['transport'] | null = options.transport || (config.SMTP_HOST ? require('nodemailer').createTransport({ host: config.SMTP_HOST, port: Number(config.SMTP_PORT || 587), secure: Number(config.SMTP_PORT || 587) === 465, ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS } } : {}) }) : null);
  async function deliverMail() {
    if (!transport || sending) return;
    sending = true;
    try {
      for (const mail of read().state.mails.filter(entry => !entry.deliveredAt)) {
        const recipient = db.prepare('SELECT email FROM users WHERE id=?').get(mail.to); if (!recipient) continue;
        try {
          await transport.sendMail({ from: config.SMTP_FROM || config.SMTP_USER, to: recipient.email as string, subject: mail.subject, text: mail.paragraphs.join('\n\n') + (mail.actions.length ? '\n\n開啟操作確認頁：' + (config.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '') + '/#/mail-action/' + mail.token : '') });
          transaction(snapshot => { snapshot.state.mails.find(entry => entry.id === mail.id)!.deliveredAt = now().toISOString(); });
        } catch (error) { console.error('Mail delivery failed:', error instanceof Error ? ("code" in error ? error.code : error.message) : error); }
      }
    } finally { sending = false; }
  }
  runDaily();
  const timer = options.scheduler === false ? null : setInterval(() => {
    try { runDaily(); } catch (error) { console.error('Daily job failed:', error instanceof Error ? error.message : String(error)); }
    deliverMail().catch(error => console.error('Mail job failed:', error.message));
  }, 60000);
  timer?.unref();
  app.locals.close = () => { if (timer) clearInterval(timer); db.close(); };
  app.locals.runDaily = runDaily;
  app.locals.deliverMail = deliverMail;
  return app;
}
