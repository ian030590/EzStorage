import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createDemoApi, qrLink } from '../prototype/demo-api.ts';

const base = '/EzStorage/';
const page = 'https://example.github.io' + base;
const clock = () => new Date('2026-11-18T02:00:00Z');

test('demo borrows and returns with account switching and localStorage persistence', async t => {
  const { window } = new JSDOM('', { url: page, runScripts: 'outside-only' });
  t.after(() => window.close());
  const api = createDemoApi(window.localStorage, base, clock);
  const initial = await api.request('/api/state');
  assert.ok(typeof initial === 'object' && 'state' in initial);
  assert.equal(initial.user?.name, '示範管理者');
  assert.ok(initial.data.rooms.every(room => room.name.startsWith('示範｜')));
  const inventory = initial.data.items[0];
  const today = initial.state.today;

  const loggedOut = await api.request('/api/logout', 'POST');
  assert.ok(typeof loggedOut === 'object' && 'user' in loggedOut);
  assert.equal(loggedOut.user, null);
  await api.request('/api/login', 'POST', { email: 'user-a@example.com', password: 'EzStorageDemo24' });
  const borrowed = await api.request('/api/actions', 'POST', {
    action: 'makeBorrow',
    args: [null, '示範使用者 A', [{ itemId: inventory.id, quantity: 1, start: today, end: today }], 'scan'],
  });
  assert.ok(typeof borrowed === 'object' && 'state' in borrowed);
  assert.equal(borrowed.state.records[0]?.picked, 1);
  assert.equal(borrowed.state.records[0]?.userId, borrowed.user?.id);

  const reloaded = createDemoApi(window.localStorage, base, clock);
  const returned = await reloaded.request('/api/actions', 'POST', { action: 'returnQuantity', args: [borrowed.state.records[0].id, 1] });
  assert.ok(typeof returned === 'object' && 'state' in returned);
  assert.equal(returned.state.records[0]?.returned, 1);
  assert.equal(returned.user?.name, '示範使用者 A');
  await reloaded.request('/api/register', 'POST', { name: '示範新帳號', email: 'new@example.com', password: 'test-password-123' });
  const registered = await api.request('/api/state');
  assert.ok(typeof registered === 'object' && 'user' in registered);
  assert.equal(registered.user?.email, 'new@example.com');
  await assert.rejects(api.request('/api/rooms', 'POST', { name: '不可建立' }), { status: 403 });

  window.localStorage.setItem('another-app', 'retained');
  await reloaded.reset();
  const reset = await api.request('/api/state');
  assert.deepEqual(reset, initial);
  assert.equal(window.localStorage.getItem('another-app'), 'retained');
});

test('demo generates an SVG for a Pages scan link containing the repository base', async t => {
  const { window } = new JSDOM('', { url: page, runScripts: 'outside-only' });
  t.after(() => window.close());
  const api = createDemoApi(window.localStorage, base, clock);
  const link = qrLink(page + '#/qr', '#/scan/item/emotion');
  assert.equal(link, 'https://example.github.io/EzStorage/#/scan/item/emotion');
  const svg = await api.request('/api/qr.svg?text=' + encodeURIComponent(link));
  assert.equal(typeof svg, 'string');
  assert.match(svg as string, /^<svg/);
});
