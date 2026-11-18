'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app');
const createEngine = require('../shared/engine');
const inject = require('./inject.cjs');
const ADMIN_PASSWORD = 'test-password-12345';
async function harness(t, options = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), 'ezstorage-test-'));
  const dbPath = path.join(folder, 'test.sqlite');
  let app;
  async function start() {
    app = createApp({ DATABASE_PATH: dbPath, ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD, ALLOW_REGISTRATION: 'true', SEED_DEMO: 'true', scheduler: false, now: () => new Date('2026-11-17T02:00:00Z'), ...options });

  }
  async function close() { app.locals.close(); }
  await start();
  t.after(async () => { await close(); rmSync(folder, { recursive: true, force: true }); });
  async function request(route, { method = 'GET', body, cookie, headers } = {}) {
    return inject(app, route, { method, body, headers: { ...(cookie ? { cookie } : {}), ...headers } });
  }
  async function login() { return (await request('/api/login', { method: 'POST', body: { email: 'admin@example.com', password: ADMIN_PASSWORD } })).cookie; }
  async function register(email, name) { return request('/api/register', { method: 'POST', body: { email, name, password: 'borrower-password-123' } }); }
  async function action(cookie, action, args) { return request('/api/actions', { method: 'POST', cookie, body: { action, args } }); }
  return { request, login, register, action, dbPath, async restart() { await close(); await start(); }, get app() { return app; } };
}
test('public catalog has no mock people/history or private emails and admin password is required', async t => {
  assert.throws(() => createApp({ DATABASE_PATH: ':memory:', ADMIN_PASSWORD: undefined, scheduler: false }), /密碼/);
  assert.throws(() => createApp({ DATABASE_PATH: ':memory:', ADMIN_PASSWORD: 'replace-with-a-long-random-password', scheduler: false }), /範例密碼/);
  const h = await harness(t);
  const publicState = await h.request('/api/state');
  assert.equal(publicState.status, 200);
  assert.equal(publicState.body.data.today, '2026-11-17');
  assert.equal(publicState.body.state.records.length, 0);
  assert.equal(publicState.body.state.mails.length, 0);
  assert.equal(publicState.body.data.people[0].email, undefined);
  assert.equal(publicState.body.user, null);
  assert.equal((await h.request('/api/health')).status, 200);
});
test('cookie login, protected catalog, registration, logout and CSRF origin checks', async t => {
  const h = await harness(t);
  assert.equal((await h.request('/api/login', { method: 'POST', body: { email: 'admin@example.com', password: 'bad' } })).status, 401);
  assert.equal((await h.request('/api/rooms', { method: 'POST', body: { name: 'room' } })).status, 401);
  const admin = await h.login();
  const registered = await h.register('person@example.com', '借用人');
  assert.equal(registered.status, 201); assert.equal(registered.body.user.role, 'borrower');
  assert.match(registered.headers.get('set-cookie'), /HttpOnly/); assert.match(registered.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await h.request('/api/rooms', { method: 'POST', cookie: registered.cookie, body: { name: 'room' } })).status, 403);
  assert.equal((await h.request('/api/rooms', { method: 'POST', cookie: admin, body: { name: 'room' }, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await h.request('/api/logout', { method: 'POST', cookie: admin })).status, 200);
  assert.equal((await h.request('/api/rooms', { method: 'POST', cookie: admin, body: { name: 'room' } })).status, 401);
});
test('registration is closed unless explicitly enabled', async t => {
  const h = await harness(t, { ALLOW_REGISTRATION: 'false' });
  assert.equal((await h.register('person@example.com', '借用人')).status, 403);
  assert.equal((await h.request('/api/state')).body.registrationEnabled, false);
});
test('catalog creation, rename, free placement and item asset numbers survive restart', async t => {
  const h = await harness(t), cookie = await h.login();
  let result = await h.request('/api/rooms', { method: 'POST', cookie, body: { name: '自由命名的工作室' } });
  const room = result.body.data.rooms.at(-1);
  result = await h.request('/api/units', { method: 'POST', cookie, body: { room: room.id, code: 'MY-DESK', name: '喜歡的架子', type: 'shelf' } });
  assert.equal(result.status, 200);
  result = await h.request('/api/units/MY-DESK', { method: 'PATCH', cookie, body: { x: 2, z: 1, rotation: Math.PI / 2 } });
  assert.equal(result.status, 200);
  result = await h.request('/api/items', { method: 'POST', cookie, body: { name: '自訂物品', unit: 'MY-DESK', layer: 1, total: 2, assetNumber: 'EZ-2026-TA-00001' } });
  assert.equal(result.status, 200); const item = result.body.data.items.at(-1);
  result = await h.request('/api/items/' + item.id, { method: 'PATCH', cookie, body: { x: .23, y: .75 } });
  assert.equal(result.status, 200);
  await h.restart(); const saved = (await h.request('/api/state')).body;
  assert.equal(saved.data.rooms.at(-1).name, room.name);
  assert.equal(saved.data.units.at(-1).x, 2);
  assert.equal(saved.data.items.at(-1).assetNumber, 'EZ-2026-TA-00001');
  assert.equal(saved.data.items.at(-1).x, .23);
});
test('catalog validates duplicate assets, room bounds, layers and stale revisions atomically', async t => {
  const h = await harness(t), cookie = await h.login();
  assert.equal((await h.request('/api/items/emotion', { method: 'PATCH', cookie, body: { assetNumber: 'A-123' } })).status, 200);
  assert.equal((await h.request('/api/items/action', { method: 'PATCH', cookie, body: { assetNumber: 'a-123' } })).status, 409);
  assert.equal((await h.request('/api/items/emotion', { method: 'PATCH', cookie, body: { unit: 'none' } })).status, 400);
  assert.equal((await h.request('/api/units/A1', { method: 'PATCH', cookie, body: { x: 5, z: 4 } })).status, 400);
  assert.equal((await h.request('/api/units/A1', { method: 'PATCH', cookie, body: { layers: 1 } })).status, 400);
  assert.equal((await h.request('/api/rooms/1', { method: 'PATCH', cookie, body: { name: 'bad revision', revision: 0 } })).status, 409);
  const saved = (await h.request('/api/state')).body;
  assert.equal(saved.data.items.find(item => item.id === 'emotion').unit, 'A1');
  assert.equal(saved.data.units.find(unit => unit.code === 'A1').x, -1);
});
test('new items receive distinct automatic positions and keep explicit coordinates', async t => {
  const h = await harness(t), cookie = await h.login();
  const created = [];
  for (let index = 0; index < 8; index++) {
    const result = await h.request('/api/items', { method: 'POST', cookie, body: { name: '新物品 ' + index, unit: 'A1', layer: 1 } });
    assert.equal(result.status, 200);
    created.push(result.body.data.items.at(-1));
  }
  assert.equal(new Set(created.map(item => item.x + ':' + item.y)).size, created.length);
  assert.ok(created.every(item => item.x > 0 && item.x < 1 && item.y > 0 && item.y < 1));
  const explicit = await h.request('/api/items', { method: 'POST', cookie, body: { name: '指定位置', unit: 'A1', layer: 2, x: .37, y: .61 } });
  assert.equal(explicit.status, 200);
  assert.equal(explicit.body.data.items.at(-1).x, .37);
  assert.equal(explicit.body.data.items.at(-1).y, .61);
  await h.restart();
  const saved = (await h.request('/api/state')).body.data.items;
  assert.deepEqual(saved.find(item => item.id === created[0].id), created[0]);
});
test('parent movement moves nested boxes with rotation in same transaction', async t => {
  const h = await harness(t), cookie = await h.login();
  const initial = (await h.request('/api/state')).body.data;
  const parent = initial.units.find(unit => unit.code === 'B1'), child = initial.units.find(unit => unit.code === 'A2');
  const angle = Math.PI / 2;
  const changed = await h.request('/api/units/B1', { method: 'PATCH', cookie, body: { x: 0, z: 0, rotation: parent.rotation + angle } });
  assert.equal(changed.status, 200);
  const moved = changed.body.data.units.find(unit => unit.code === 'A2');
  assert.ok(Math.abs(moved.x - (child.z - parent.z)) < 1e-8);
  assert.ok(Math.abs(moved.z + (child.x - parent.x)) < 1e-8);
  assert.equal((await h.request('/api/units/A2', { method: 'PATCH', cookie, body: { x: 1 } })).status, 400);
});
test('server owns borrowing identity, inventory capacity and validation; returns keep history', async t => {
  const h = await harness(t), alice = await h.register('alice@example.com', 'Alice'), bob = await h.register('bob@example.com', 'Bob');
  const selection = { itemId: 'emotion', quantity: 3, start: '2026-11-17', end: '2026-11-20' };
  const borrowed = await h.action(alice.cookie, 'makeBorrow', [bob.body.user.id, 'Alice', [selection], 'scan']);
  assert.equal(borrowed.status, 200); const record = borrowed.body.state.records.at(-1);
  assert.equal(record.userId, alice.body.user.id); assert.equal(record.picked, 3);
  const conflict = await h.action(bob.cookie, 'makeBorrow', [bob.body.user.id, 'Bob', [{ ...selection, quantity: 2 }], 'web']);
  assert.equal(conflict.status, 400); assert.match(conflict.body.error, /最多可借 1/);
  assert.equal((await h.action(bob.cookie, 'returnQuantity', [record.id, 1, alice.body.user.id])).status, 403);
  const returned = await h.action(alice.cookie, 'returnQuantity', [record.id, 1, alice.body.user.id]);
  assert.equal(returned.status, 200); assert.equal(returned.body.state.records.at(-1).returned, 1);
  assert.equal(returned.body.state.records.length, 1);
  assert.equal((await h.action(alice.cookie, 'makeBorrow', [null, 'Alice', [{ ...selection, start: '2027-02-30', end: '2027-03-02' }], 'web'])).status, 400);
});
test('concurrent borrowers cannot overbook and reducing total preserves commitments', async t => {
  const h = await harness(t), cookie = await h.login();
  const args = [null, '管理者', [{ itemId: 'mirror', quantity: 1, start: '2026-11-17', end: '2026-11-20' }], 'web'];
  const results = await Promise.all([h.action(cookie, 'makeBorrow', args), h.action(cookie, 'makeBorrow', args)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  await h.action(cookie, 'makeBorrow', [null, '管理者', [{ itemId: 'emotion', quantity: 3, start: '2026-11-17', end: '2026-11-20' }], 'web']);
  assert.equal((await h.request('/api/items/emotion', { method: 'PATCH', cookie, body: { total: 2 } })).status, 400);
  assert.equal((await h.request('/api/items/emotion', { method: 'PATCH', cookie, body: { total: 3 } })).status, 200);
});
test('extension messages are private and bearer GET does not mutate; POST is one-time', async t => {
  const h = await harness(t), alice = await h.register('alice@example.com', 'Alice'), bob = await h.register('bob@example.com', 'Bob');
  const loan = await h.action(alice.cookie, 'makeBorrow', [null, 'Alice', [{ itemId: 'mirror', quantity: 1, start: '2026-11-17', end: '2026-11-18' }], 'scan']);
  const loanId = loan.body.state.records.at(-1).id;
  await h.action(bob.cookie, 'makeBorrow', [null, 'Bob', [{ itemId: 'mirror', quantity: 1, start: '2026-11-19', end: '2026-11-25' }], 'web']);
  assert.equal((await h.action(alice.cookie, 'extend', [loanId, 3])).status, 200);
  const bobState = await h.request('/api/state', { cookie: bob.cookie });
  const mail = bobState.body.state.mails.find(mail => mail.actions.includes('agree'));
  assert.ok(mail?.token);
  assert.equal((await h.request('/api/state')).body.state.mails.length, 0);
  assert.equal((await h.request('/api/mail-actions/' + mail.token)).status, 200);
  let after = (await h.request('/api/state', { cookie: alice.cookie })).body;
  assert.equal(after.state.records.find(record => record.id === loanId).end, '2026-11-18');
  assert.equal((await h.request('/api/mail-actions/' + mail.token, { method: 'POST', body: { action: 'agree' } })).status, 200);
  after = (await h.request('/api/state', { cookie: alice.cookie })).body;
  assert.equal(after.state.records.find(record => record.id === loanId).end, '2026-11-21');
  assert.equal((await h.request('/api/mail-actions/' + mail.token, { method: 'POST', body: { action: 'agree' } })).status, 409);
});
test('engine leap dates and calendar bounds are strict', () => {
  const engine = createEngine({ today: '2026-11-17', people: [], rooms: [], units: [], items: [] });
  assert.equal(engine.validDates('2026-02-30', '2026-03-02'), false);
  assert.equal(engine.validDates('2028-02-29', '2028-03-01'), true);
  assert.equal(engine.validDates('2026-01-01', '2025-01-01'), false);
});

test('daily job and SMTP outbox retry preserve private reminders without duplicate sends', async t => {
  let clock = new Date('2026-11-17T02:00:00Z'), sent = [], reject = true;
  const transport = { async sendMail(message) { if (reject) throw Object.assign(new Error('temporary failure'), { code: 'TEST_RETRY' }); sent.push(message); } };
  const h = await harness(t, { now: () => clock, transport }); const cookie = await h.login();
  await h.action(cookie, 'makeBorrow', [null, '管理者', [{ itemId: 'mirror', quantity: 1, start: '2026-11-17', end: '2026-11-17' }], 'scan']);
  clock = new Date('2026-11-18T00:01:00Z'); h.app.locals.runDaily(); h.app.locals.runDaily();
  let messages = (await h.request('/api/state', { cookie })).body.state.mails;
  assert.equal(messages.filter(mail => mail.type === 'reminder').length, 1);
  const oldError = console.error; console.error = () => {};
  try { await h.app.locals.deliverMail(); } finally { console.error = oldError; }
  assert.equal(sent.length, 0); reject = false;
  await h.app.locals.deliverMail(); await h.app.locals.deliverMail();
  assert.equal(sent.length, messages.length); assert.ok(sent.every(mail => mail.to === 'admin@example.com'));
  assert.ok(sent.some(mail => mail.text.includes('#/mail-action/')));
  messages = (await h.request('/api/state', { cookie })).body.state.mails;
  assert.ok(messages.every(mail => mail.deliveredAt));
});
test('self-hosted assets and QR endpoint work without CDN and importmap CSP uses a hash', async t => {
  const h = await harness(t);
  const index = await h.request('/');
  assert.equal(index.status, 200); assert.match(index.body, /bootstrap.js/);
  assert.match(index.headers.get('content-security-policy'), /script-src 'self' 'sha256-/);
  const qr = await h.request('/api/qr.svg?text=https%3A%2F%2Fexample.com%2F%23%2Fscan%2Fitem%2Femotion');
  assert.equal(qr.status, 200); assert.match(qr.body, /<svg/);
  assert.equal((await h.request('/shared/engine.js')).status, 200);
  assert.equal((await h.request('/vendor/three/build/three.module.js')).status, 200);
});
test('maintenance CLI creates borrowers and password reset revokes sessions', async t => {
  const { spawnSync } = require('node:child_process'); const h = await harness(t);
  const run = (args, secret) => spawnSync(process.execPath, ['scripts/user.cjs', ...args], { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, DATABASE_PATH: h.dbPath, EZSTORAGE_USER_PASSWORD: secret } });
  assert.equal(run(['create', 'staff@example.com', '同仁'], 'staff-password-123').status, 0);
  const login = await h.request('/api/login', { method: 'POST', body: { email: 'staff@example.com', password: 'staff-password-123' } });
  assert.equal(login.status, 200); assert.equal(login.body.user.role, 'borrower');
  assert.equal(run(['reset', 'staff@example.com'], 'new-password-12345').status, 0);
  assert.equal((await h.action(login.cookie, 'makeBorrow', [null, '同仁', [], 'web'])).status, 401);
  assert.equal((await h.request('/api/login', { method: 'POST', body: { email: 'staff@example.com', password: 'staff-password-123' } })).status, 401);
  assert.equal((await h.request('/api/login', { method: 'POST', body: { email: 'staff@example.com', password: 'new-password-12345' } })).status, 200);
});

test('default installation starts with an empty real catalog; demo data is opt-in', async t => {
  const h = await harness(t, { SEED_DEMO: 'false' });
  const snapshot = (await h.request('/api/state')).body;
  assert.equal(snapshot.data.units.length, 0); assert.equal(snapshot.data.items.length, 0);
  assert.equal(snapshot.data.rooms[0].name, '第一個房間');
});
test('generated storage codes are short and unique', async t => {
  const h = await harness(t, { SEED_DEMO: 'false' }), cookie = await h.login();
  const first = await h.request('/api/units', { method: 'POST', cookie, body: { room: '1', name: '第一個架子', type: 'shelf' } });
  const second = await h.request('/api/units', { method: 'POST', cookie, body: { room: '1', name: '第二個架子', type: 'shelf' } });
  assert.equal(first.body.data.units[0].code, 'U1');
  assert.deepEqual(second.body.data.units.map(unit => unit.code), ['U1', 'U2']);
});
test('unexpected server errors are generic and malformed JSON bodies are rejected', async t => {
  const h = await harness(t);
  assert.equal((await h.request('/api/login', { method: 'POST', body: [] })).status, 400);
  const qr = require('qrcode'), original = qr.toString, originalError = console.error;
  qr.toString = async () => { throw new Error('private internal details'); }; console.error = () => {};
  try {
    const result = await h.request('/api/qr.svg?text=test');
    assert.equal(result.status, 500); assert.doesNotMatch(result.body.error, /private internal/);
  } finally { qr.toString = original; console.error = originalError; }
});
