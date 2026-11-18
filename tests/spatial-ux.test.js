const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { nextItemPosition } = require('../shared/placement');
const root = path.resolve(__dirname, '..');

test('automatic placement spreads new items within each shelf without changing existing items', () => {
  const items = [{ unit: 'other', layer: 1, x: .18, y: .25 }, { unit: 'A', layer: 2, x: .5, y: .25 }];
  const original = structuredClone(items);
  assert.deepEqual(nextItemPosition(items, 'A', 1), { x: .18, y: .25 });
  const created = [];
  for (let index = 0; index < 100; index++) {
    const position = nextItemPosition(items, 'A', 1);
    assert.ok(position.x >= .05 && position.x <= .95 && position.y >= .1 && position.y <= .85);
    assert.ok(!created.some(item => item.x === position.x && item.y === position.y));
    const item = { unit: 'A', layer: 1, ...position };
    items.push(item); created.push(item);
  }
  assert.deepEqual(items.slice(0, 2), original);
  assert.deepEqual(created.slice(0, 6).map(({ x, y }) => ({ x, y })), [.25, .7].flatMap(y => [.18, .5, .82].map(x => ({ x, y }))));
  assert.deepEqual(nextItemPosition([{ unit: 'A', layer: 1 }], 'A', 1), { x: .5, y: .25 });
});

async function roomPage(t, { role = 'admin', empty = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'prototype/index.html'), 'utf8'), { url: 'http://localhost:3000/#/room/1', runScripts: 'outside-only' });
  const w = dom.window;
  t.after(() => w.close());
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () { this.dataset.scrolled = 'true'; };
  const user = role ? { id: role, name: '測試帳號', email: 'test@example.com', role } : null;
  const snapshot = {
    data: {
      today: '2026-11-18', people: user ? [user] : [], rooms: [{ id: '1', name: '教具房間' }],
      units: empty ? [] : [{ code: 'A', room: '1', name: '教具架', type: 'shelf', layers: 2, w: 2, h: 2, d: 1, x: 0, z: 0, rotation: 0 }],
      items: empty ? [] : [{ id: 'item-a', name: '積木', code: 'A-1-a', unit: 'A', layer: 1, total: 3, assetNumber: '', image: '', x: .23, y: .71 }],
      types: { shelf: '層架', box: '收納箱', cabinet: '櫃子', drawer: '抽屜櫃' }
    },
    state: { today: '2026-11-18', records: [], events: [], requests: [], handovers: [], mails: [], receipts: [] },
    user, revision: 0, registrationEnabled: false
  };
  const rotations = [];
  let selectUnit;
  w.fetch = async () => ({ ok: true, status: 200, json: async () => structuredClone(snapshot) });
  w.EZRoom = function (host, id, onSelect) {
    selectUnit = onSelect;
    this.select = () => {};
    this.destroy = () => {};
    this.setEditing = () => {};
    this.rotateSelected = async delta => { rotations.push(delta); return true; };
  };
  for (const script of ['shared/engine.js', 'shared/placement.js', 'prototype/app.js']) {
    await w.eval(fs.readFileSync(path.join(root, script), 'utf8'));
  }
  return { w, document: w.document, rotations, select: () => selectUnit('A', null), tick: () => new Promise(resolve => setTimeout(resolve, 15)) };
}

test('finishing arrangement and borrower browsing both retain the saved shelf map', async t => {
  const admin = await roomPage(t);
  admin.select();
  admin.document.getElementById('arrange-toggle').click();
  assert.equal(admin.document.querySelectorAll('[data-place-item]').length, 1);
  admin.document.getElementById('arrange-toggle').click();
  const placed = admin.document.querySelector('[data-view-item="item-a"]');
  assert.ok(placed);
  assert.match(placed.style.left, /\b23%/);
  assert.match(placed.style.top, /\b71%/);
  assert.equal(admin.document.querySelectorAll('[data-place-item]').length, 0);
  assert.equal(admin.document.querySelectorAll('.placement-map').length, 1);
  assert.equal(admin.document.querySelector('.item-drop-zone'), null);
  assert.match(admin.document.querySelector('.shelf-back').textContent, /後/);
  assert.match(admin.document.querySelector('.shelf-front').textContent, /前/);
  placed.click();
  const row = admin.document.querySelector('[data-inventory="item-a"]');
  assert.equal(row.dataset.scrolled, 'true');

  const borrower = await roomPage(t, { role: 'borrower' });
  borrower.select();
  const marker = borrower.document.querySelector('[data-view-item="item-a"]');
  assert.match(marker.style.left, /\b23%/);
  assert.match(marker.style.top, /\b71%/);
  assert.equal(borrower.document.querySelector('[data-place-item]'), null);
  assert.equal(borrower.document.getElementById('arrange-toggle'), null);
});

test('an empty room gives administrators the next setup step and borrowers a clear explanation', async t => {
  const admin = await roomPage(t, { empty: true });
  const setup = admin.document.querySelector('.room-empty');
  assert.ok(setup);
  assert.match(setup.textContent, /儲存處/);
  assert.equal(setup.querySelector('a').getAttribute('href'), '#/manage/1');
  const borrower = await roomPage(t, { role: 'borrower', empty: true });
  const notice = borrower.document.querySelector('.room-empty');
  assert.ok(notice);
  assert.match(notice.textContent, /管理者|尚未/);
  assert.equal(notice.querySelector('a[href^="#/manage"]'), null);
});

test('visible rotation controls follow editing and selection and support both directions', async t => {
  const page = await roomPage(t);
  page.document.getElementById('arrange-toggle').click();
  const left = page.document.getElementById('rotate-left');
  const right = page.document.getElementById('rotate-right');
  assert.ok(left && right);
  assert.equal(left.disabled, true);
  assert.equal(right.disabled, true);
  page.select();
  assert.equal(left.disabled, false);
  assert.equal(right.disabled, false);
  left.click(); await page.tick();
  right.click(); await page.tick();
  assert.deepEqual(page.rotations, [-Math.PI / 2, Math.PI / 2]);
  page.document.getElementById('arrange-toggle').click();
  assert.equal(left.disabled, true);
  assert.equal(right.disabled, true);
});
