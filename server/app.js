'use strict';
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const createEngine = require('../shared/engine');
const { nextItemPosition } = require('../shared/placement');
const { password, hashPassword, verifyPassword } = require('./auth');
const seed = require('./seed.json');
const ROOT = path.resolve(__dirname, '..');
const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function text(value, label, max = 100, empty = false) {
  if (typeof value !== 'string' || value.trim().length > max || (!empty && !value.trim())) fail('請填寫有效的' + label + '。');
  return value.trim();
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(label + '須為 ' + min + ' 至 ' + max + ' 的整數。');
  return value;
}
function number(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) fail(label + '超出允許範圍。');
  return value;
}
function email(value) {
  value = text(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('請填寫有效的 Email。');
  return value;
}
function currentParts(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { today: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
function createApp(options = {}) {
  const config = { ...process.env, ...options };
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
    const data = config.SEED_DEMO === 'true' ? clone(seed) : { ...clone(seed), rooms: [{ id: '1', name: '第一個房間' }], units: [], items: [], people: [], records: [] }; data.today = current().today;
    if (config.SEED_DEMO === 'true') data.rooms.forEach(room => { room.name = '示範｜' + room.name; });
    const engine = createEngine(data);
    // shortcut: workflow state is one transactional SQLite document; normalize before multiple app replicas or large histories.
    db.prepare('INSERT INTO application VALUES (1, ?)').run(JSON.stringify({ data, state: engine.state, revision: 0, lastDaily: null }));
  }
  const read = () => JSON.parse(db.prepare('SELECT json FROM application WHERE id=1').get().json);
  const save = snapshot => db.prepare('UPDATE application SET json=? WHERE id=1').run(JSON.stringify(snapshot));
  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try { const snapshot = read(); const result = callback(snapshot); snapshot.revision++; save(snapshot); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function engineFor(snapshot) {
    snapshot.data.today = snapshot.state.today = current().today;
    snapshot.data.people = db.prepare('SELECT id,name,email FROM users').all();
    return createEngine(snapshot.data, snapshot.state);
  }
  function publicUser(user) { return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null; }
  function view(user, result) {
    const snapshot = read(); engineFor(snapshot);
    const own = user && user.id;
    const data = clone(snapshot.data);
    data.people = data.people.map(person => person.id === own ? person : { id: person.id, name: person.name });
    const state = clone(snapshot.state);
    state.user = publicUser(user);
    state.mails = state.mails.filter(mail => mail.to === own);
    state.receipts = state.receipts.filter(receipt => receipt.userId === own);
    state.events = user && user.role === 'admin' ? state.events : [];
    state.requests = state.requests.filter(request => own && (state.records.find(record => record.id === request.loanId)?.userId === own || request.affected.some(answer => state.records.find(record => record.id === answer.recordId)?.userId === own)));
    state.handovers = state.handovers.filter(handover => own && [handover.loanId, handover.reservationId].some(id => state.records.find(record => record.id === id)?.userId === own));
    return { data, state, user: publicUser(user), registrationEnabled: config.ALLOW_REGISTRATION === 'true', revision: snapshot.revision, ...(result ? { result } : {}) };
  }
  function ownRecord(engine, id, user) {
    const record = engine.record(id);
    if (!record || record.userId !== user.id) fail('無法操作其他人的借用紀錄。', 403);
    return record;
  }
  function perform(engine, user, action, args) {
    if (!Array.isArray(args) || args.length > 5) fail('操作參數不正確。');
    let result;
    switch (action) {
      case 'makeBorrow': {
        const name = text(args[1], '姓名', 80);
        if (!Array.isArray(args[2]) || args[2].length < 1 || args[2].length > 100 || !['web', 'scan'].includes(args[3])) fail('借用內容不正確。');
        for (const selection of args[2]) if (!selection || typeof selection !== 'object') fail('借用內容不正確。');
        result = engine.makeBorrow(user.id, name, args[2], args[3]); break;
      }
      case 'pickup': ownRecord(engine, args[0], user); result = engine.pickup(args[0], user.id); break;
      case 'returnQuantity': ownRecord(engine, args[0], user); result = engine.returnQuantity(args[0], args[1], user.id); break;
      case 'cancelReservation': ownRecord(engine, args[0], user); result = engine.cancelReservation(args[0], user.id); break;
      case 'rescheduleReservation': ownRecord(engine, args[0], user); if (!args[1] || typeof args[1] !== 'object') fail('請填寫改期內容。'); result = engine.rescheduleReservation(args[0], args[1], user.id); break;
      case 'extend': ownRecord(engine, args[0], user); result = engine.extend(args[0], args[1]); break;
      case 'sendHandover': ownRecord(engine, args[0], user); if (!Array.isArray(args[1]) || args[1].length > 100 || args[1].some(allocation => !allocation || typeof allocation !== 'object')) fail('轉交內容不正確。'); result = engine.sendHandover(args[0], args[1]); break;
      case 'respondExtension': ownRecord(engine, args[1], user); if (typeof args[2] !== 'boolean') fail('請選擇同意或不同意。'); result = engine.respondExtension(args[0], args[1], args[2]); break;
      case 'respondHandover': {
        const handover = engine.state.handovers.find(entry => entry.id === args[0]);
        if (!handover) fail('找不到這筆轉交。', 404);
        ownRecord(engine, handover.reservationId, user); if (typeof args[1] !== 'boolean') fail('請確認收到或拒絕。'); result = engine.respondHandover(args[0], args[1]); break;
      }
      default: fail('不支援這個操作。');
    }
    if (result) result.userId = user.id;
    return result;
  }
  const importMap = readFileSync(path.join(ROOT, 'prototype/index.html'), 'utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
  const importMapHash = importMap ? " 'sha256-" + createHash('sha256').update(importMap).digest('base64') + "'" : '';
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${importMapHash}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
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
    req.user = session || null;
    next();
  });
  const auth = (req, _res, next) => { if (!req.user) return next(Object.assign(new Error('請先登入。'), { status: 401 })); next(); };
  const admin = (req, res, next) => auth(req, res, error => { if (error) return next(error); if (req.user.role !== 'admin') return next(Object.assign(new Error('只有管理者能編輯房間與物品。'), { status: 403 })); next(); });
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: config.COOKIE_SECURE === 'true', path: '/', maxAge: 7 * 86400000 };
  function loginUser(res, user) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now().getTime());
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), user.id, now().getTime() + cookieOptions.maxAge);
    res.cookie('ezstorage_session', token, cookieOptions);
  }
  const attempts = new Map();
  function throttle(req) {
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, expires: now().getTime() + 15 * 60000 };
    if (entry.expires < now().getTime()) { entry.count = 0; entry.expires = now().getTime() + 15 * 60000; }
    if (++entry.count > 20) fail('嘗試次數過多，請在 15 分鐘後再試。', 429);
    attempts.set(key, entry);
  }
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/state', (req, res) => res.json(view(req.user)));
  app.post('/api/login', (req, res) => {
    throttle(req);
    const address = email(req.body.email);
    if (typeof req.body.password !== 'string' || req.body.password.length > 128) fail('帳號或密碼不正確。', 401);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(address);
    if (!user || !verifyPassword(req.body.password, user.password)) fail('帳號或密碼不正確。', 401);
    loginUser(res, user); res.json(view(user));
  });
  app.post('/api/register', (req, res) => {
    if (config.ALLOW_REGISTRATION !== 'true') fail('目前未開放自行註冊，請聯絡管理者。', 403);
    throttle(req);
    const address = email(req.body.email), name = text(req.body.name, '姓名', 80), secret = hashPassword(password(req.body.password));
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(address)) fail('這個 Email 已註冊。', 409);
    const user = { id: randomUUID(), email: address, name, role: 'borrower' };
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(user.id, address, name, secret, user.role);
    loginUser(res, user); res.status(201).json(view(user));
  });
  app.post('/api/logout', (req, res) => {
    const token = (req.headers.cookie || '').match(/(?:^|;\s*)ezstorage_session=([^;]+)/)?.[1];
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
    res.clearCookie('ezstorage_session', cookieOptions); res.json(view(null));
  });
  app.post('/api/actions', auth, (req, res) => {
    const result = transaction(snapshot => perform(engineFor(snapshot), req.user, req.body.action, req.body.args));
    res.json(view(req.user, result));
  });
  function change(req, res, callback) {
    transaction(snapshot => {
      if (req.body.revision !== undefined && req.body.revision !== snapshot.revision) fail('資料已被其他人更新，請重新整理後再試。', 409);
      const engine = engineFor(snapshot); callback(snapshot.data, engine);
      snapshot.state.events.push({ id: randomUUID(), type: 'catalog_update', ref: req.path, date: snapshot.data.today, details: { userId: req.user.id, method: req.method } });
    });
    res.json(view(req.user));
  }
  app.post('/api/rooms', admin, (req, res) => change(req, res, data => data.rooms.push({ id: randomUUID(), name: text(req.body.name, '房間名稱', 80) })));
  app.patch('/api/rooms/:id', admin, (req, res) => change(req, res, data => {
    const room = data.rooms.find(entry => entry.id === req.params.id); if (!room) fail('找不到這個房間。', 404);
    room.name = text(req.body.name, '房間名稱', 80);
  }));
  function validateUnit(unit, data) {
    if (!data.rooms.some(room => room.id === unit.room)) fail('找不到房間。');
    if (!Object.hasOwn(data.types, unit.type)) fail('儲存處類型不正確。');
    unit.name = text(unit.name || data.types[unit.type], '儲存處名稱', 80);
    integer(unit.layers, unit.type === 'box' ? 0 : 1, unit.type === 'box' ? 0 : 10, '層數');
    for (const key of ['w', 'h', 'd']) number(unit[key], .2, 4, '尺寸');
    number(unit.rotation, -Math.PI * 2, Math.PI * 2, '旋轉角度');
    number(unit.x, -5, 5, 'X 位置'); number(unit.z, -4, 4, 'Z 位置');
    const halfX = (Math.abs(Math.cos(unit.rotation)) * unit.w + Math.abs(Math.sin(unit.rotation)) * unit.d) / 2;
    const halfZ = (Math.abs(Math.sin(unit.rotation)) * unit.w + Math.abs(Math.cos(unit.rotation)) * unit.d) / 2;
    if (!unit.parent && (Math.abs(unit.x) + halfX > 5 + 1e-6 || Math.abs(unit.z) + halfZ > 4 + 1e-6)) fail('儲存處須放在房間範圍內。');
    if (unit.parent) {
      const parent = data.units.find(entry => entry.code === unit.parent && entry.room === unit.room && !entry.parent && ['cabinet', 'shelf'].includes(entry.type));
      if (!parent || unit.type !== 'box') fail('收納箱的上層儲存處不正確。');
      integer(unit.parentLayer, 1, parent.layers, '放置層');
    }
  }
  app.post('/api/units', admin, (req, res) => change(req, res, data => {
    let next = 1;
    while (data.units.some(unit => unit.code === 'U' + next)) next++;
    const code = req.body.code === undefined ? 'U' + next : text(req.body.code, '位置編號', 32);
    if (!/^[A-Za-z0-9_-]+$/.test(code) || data.units.some(unit => unit.code === code)) fail('位置編號須為不重複的英數字、底線或連字號。');
    const unit = { code, room: req.body.room, type: req.body.type || 'shelf', layers: req.body.layers ?? 3, w: req.body.w ?? 1.5, h: req.body.h ?? 2, d: req.body.d ?? .8, x: req.body.x ?? 0, z: req.body.z ?? 0, rotation: req.body.rotation ?? 0, name: req.body.name };
    if (unit.type === 'box') unit.layers = 0;
    validateUnit(unit, data); data.units.push(unit);
  }));
  app.patch('/api/units/:code', admin, (req, res) => change(req, res, data => {
    const unit = data.units.find(entry => entry.code === req.params.code); if (!unit) fail('找不到儲存處。', 404);
    const old = clone(unit);
    for (const key of ['name', 'room', 'type', 'layers', 'w', 'h', 'd', 'x', 'z', 'rotation']) if (req.body[key] !== undefined) unit[key] = req.body[key];
    if (unit.parent && ['x', 'z', 'rotation', 'room'].some(key => req.body[key] !== undefined)) fail('請移動收納箱所屬的儲存處。');
    if (unit.layers < old.layers && data.items.some(item => item.unit === unit.code && item.layer > unit.layers)) fail('請先移走受影響層的物品，再減少層數。');
    validateUnit(unit, data);
    data.items.filter(item => item.unit === unit.code).forEach(item => validateItem(item, data));
    const angle = unit.rotation - old.rotation;
    for (const child of data.units.filter(entry => entry.parent === unit.code)) {
      if (!['cabinet', 'shelf'].includes(unit.type)) fail('請先移走內部收納箱，再更改儲存處類型。');
      const dx = child.x - old.x, dz = child.z - old.z;
      child.x = unit.x + dx * Math.cos(angle) + dz * Math.sin(angle);
      child.z = unit.z - dx * Math.sin(angle) + dz * Math.cos(angle);
      child.rotation = ((child.rotation + angle + Math.PI * 2) % (Math.PI * 2)); child.room = unit.room;
      if (child.parentLayer > unit.layers) fail('請先移走受影響層的收納箱。');
    }
  }));
  function validateItem(item, data) {
    const unit = data.units.find(entry => entry.code === item.unit); if (!unit) fail('找不到儲存處。');
    item.name = text(item.name, '物品名稱', 100);
    integer(item.total, 1, 100000, '總件數');
    integer(item.layer, unit.type === 'box' ? 0 : 1, unit.layers, '所在層');
    item.assetNumber = text(item.assetNumber ?? '', '財產編號', 80, true);
    if (item.assetNumber && data.items.some(other => other.id !== item.id && other.assetNumber && other.assetNumber.toLowerCase() === item.assetNumber.toLowerCase())) fail('財產編號已使用，請輸入不重複的編號。', 409);
    if (item.x !== undefined) number(item.x, 0, 1, '物品 X 位置');
    if (item.y !== undefined) number(item.y, 0, 1, '物品 Y 位置');
  }
  app.post('/api/items', admin, (req, res) => change(req, res, data => {
    const layer = req.body.layer ?? 1;
    const position = nextItemPosition(data.items, req.body.unit, layer);
    const item = { id: randomUUID(), name: req.body.name, unit: req.body.unit, layer, total: req.body.total ?? 1, assetNumber: req.body.assetNumber ?? '', image: '', x: req.body.x ?? position.x, y: req.body.y ?? position.y };
    validateItem(item, data); item.code = item.unit + '-' + item.layer + '-' + item.id.slice(0, 6); data.items.push(item);
  }));
  app.patch('/api/items/:id', admin, (req, res) => change(req, res, (data, engine) => {
    const item = data.items.find(entry => entry.id === req.params.id); if (!item) fail('找不到物品。', 404);
    const old = clone(item);
    for (const key of ['name', 'unit', 'layer', 'total', 'assetNumber', 'x', 'y']) if (req.body[key] !== undefined) item[key] = req.body[key];
    validateItem(item, data);
    if (item.total < old.total) {
      const last = engine.state.records.filter(record => record.itemId === item.id && (engine.held(record) || engine.pending(record))).reduce((day, record) => record.end > day ? record.end : day, engine.state.today);
      const requestedTotal = item.total; item.total = old.total;
      const committed = old.total - engine.capacity(item.id, engine.state.today, last); item.total = requestedTotal;
      if (item.total < committed) fail('總件數不能少於目前借出及預約的需求。');
    }
    if (item.unit !== old.unit || item.layer !== old.layer) item.code = item.unit + '-' + item.layer + '-' + item.id.slice(0, 6);
  }));
  app.get('/api/qr.svg', async (req, res) => {
    const value = text(req.query.text, 'QR Code 內容', 2048);
    const svg = await require('qrcode').toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    res.type('image/svg+xml').send(svg);
  });
  function tokenMail(snapshot, token) {
    const mail = snapshot.state.mails.find(entry => entry.token === token);
    if (!mail) fail('信件連結無效。', 404);
    if (mail.tokenExpires && now().getTime() > mail.tokenExpires) fail('信件連結已過期，請登入「我的信件」操作。', 410);
    return mail;
  }
  app.get('/api/mail-actions/:token', (req, res) => {
    const mail = tokenMail(read(), req.params.token);
    const snapshot = read(); const engine = engineFor(snapshot); const loan = engine.record(mail.refs.loanId);
    const candidates = loan && mail.actions.includes('handover') ? engine.futureReservations(loan).map(record => ({ recordId: record.id, name: record.name, quantity: engine.pending(record) })) : [];
    res.json({ mail: { subject: mail.subject, paragraphs: mail.paragraphs, actions: mail.actions, used: !!mail.used, candidates, held: loan ? engine.held(loan) : 0 } });
  });
  app.post('/api/mail-actions/:token', (req, res) => {
    const result = transaction(snapshot => {
      const mail = tokenMail(snapshot, req.params.token);
      if (mail.used) fail('這封信的操作已處理，請登入查看最新狀態。', 409);
      const action = req.body.action;
      if (!mail.actions.includes(action)) fail('這封信不支援此操作。', 403);
      const user = db.prepare('SELECT * FROM users WHERE id=?').get(mail.to);
      const engine = engineFor(snapshot); let result;
      if (action === 'agree' || action === 'disagree') result = perform(engine, user, 'respondExtension', [mail.refs.requestId, mail.refs.reservationId, action === 'agree']);
      else if (action === 'received' || action === 'reject') result = perform(engine, user, 'respondHandover', [mail.refs.handoverId, action === 'received']);
      else if (action === 'extend') result = perform(engine, user, 'extend', [mail.refs.loanId, req.body.days]);
      else if (action === 'handover') result = perform(engine, user, 'sendHandover', [mail.refs.loanId, req.body.allocations]);
      else fail('不支援這個操作。');
      mail.used = true; return result;
    });
    res.json({ result });
  });
  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three')));
  app.use(express.static(path.join(ROOT, 'prototype'), { index: 'index.html' }));
  app.use('/api', (_req, res) => res.status(404).json({ error: '找不到 API。' }));
  app.use((error, _req, res, _next) => {
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
  const transport = options.transport || (config.SMTP_HOST ? require('nodemailer').createTransport({ host: config.SMTP_HOST, port: Number(config.SMTP_PORT || 587), secure: Number(config.SMTP_PORT || 587) === 465, ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS } } : {}) }) : null);
  async function deliverMail() {
    if (!transport || sending) return;
    sending = true;
    try {
      for (const mail of read().state.mails.filter(entry => !entry.deliveredAt)) {
        const recipient = db.prepare('SELECT email FROM users WHERE id=?').get(mail.to); if (!recipient) continue;
        try {
          await transport.sendMail({ from: config.SMTP_FROM || config.SMTP_USER, to: recipient.email, subject: mail.subject, text: mail.paragraphs.join('\n\n') + (mail.actions.length ? '\n\n開啟操作確認頁：' + (config.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '') + '/#/mail-action/' + mail.token : '') });
          transaction(snapshot => { snapshot.state.mails.find(entry => entry.id === mail.id).deliveredAt = now().toISOString(); });
        } catch (error) { console.error('Mail delivery failed:', error.code || error.message); }
      }
    } finally { sending = false; }
  }
  runDaily();
  const timer = options.scheduler === false ? null : setInterval(() => {
    try { runDaily(); } catch (error) { console.error('Daily job failed:', error.message); }
    deliverMail().catch(error => console.error('Mail job failed:', error.message));
  }, 60000);
  timer?.unref();
  app.locals.close = () => { if (timer) clearInterval(timer); db.close(); };
  app.locals.runDaily = runDaily;
  app.locals.deliverMail = deliverMail;
  return app;
}
module.exports = { createApp };
