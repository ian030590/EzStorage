'use strict';
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app');

const output = path.resolve(process.env.QA_OUTPUT || 'test-results/browser');
const password = randomBytes(24).toString('hex');
const email = 'qa-admin@example.com';
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'small-mobile', viewport: { width: 375, height: 667 }, touch: true }
];
const report = { status: 'RUNNING', profiles: [], screenshots: [], errors: [] };
let browser, app, server, folder, baseURL;
mkdirSync(output, { recursive: true });

async function route(page, hash, selector) {
  await page.goto(baseURL + '/' + hash);
  await page.locator(selector).first().waitFor({ state: 'visible' });
}
async function snapshot(page) {
  const response = await page.request.get(baseURL + '/api/state');
  assert.equal(response.status(), 200);
  return response.json();
}
async function submit(page, form, endpoint, status = 200) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && ['POST', 'PATCH'].includes(response.request().method()));
  await page.locator(form + ' [type=submit]').click();
  const value = await response;
  assert.equal(value.status(), status, await value.text());
  return value.json();
}
async function fill(page, form, fields) {
  for (const [name, value] of Object.entries(fields)) {
    const input = page.locator(form + ' [name="' + name + '"]');
    if (await input.evaluate(element => !!element.closest('details:not([open])'))) await input.locator('xpath=ancestor::details').locator('summary').click();
    if (await input.evaluate(element => element.tagName === 'SELECT')) await input.selectOption(String(value));
    else await input.fill(String(value));
  }
}
async function account(page, address, name) {
  await page.locator('#account').click();
  if (name) {
    await page.locator('#toggle-register').click();
    await page.locator('#account-form [name=name]').fill(name);
  }
  await fill(page, '#account-form', { email: address, password });
  await submit(page, '#account-form', name ? '/api/register' : '/api/login', name ? 201 : 200);
  await page.locator('#account-dialog').waitFor({ state: 'hidden' });
}
async function capture(page, name) {
  const filename = name + '.png';
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  report.screenshots.push(filename);
}
async function layout(page, profile, selected) {
  const bounds = await page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect();
    const header = document.querySelector('.topbar').getBoundingClientRect();
    const action = document.querySelector('.panel-header a');
    const rect = action && action.getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, header: header.height, stage: { top: stage.top, height: stage.height }, action: rect && { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } };
  });
  assert.equal(bounds.overflow, false, 'Horizontal page overflow');
  assert.ok(bounds.stage.height >= (profile.touch && selected ? 128 : 190), 'The room stage needs enough height to select furniture');
  if (profile.touch) {
    assert.ok(bounds.header <= 180, 'Mobile header exceeds the compact header budget');
    if (selected) {
      assert.ok(bounds.action, 'Missing borrowing action');
      assert.ok(bounds.action.bottom <= bounds.height && bounds.action.left >= 0 && bounds.action.right <= bounds.width, 'Borrowing action is outside the initial mobile viewport');
    }
  }
  return bounds;
}
async function readonlyPlacement(page, item) {
  const button = page.locator('[data-view-item="' + item.id + '"]');
  await button.waitFor({ state: 'visible' });
  await page.locator('#info-panel').evaluate(panel => { panel.scrollTop = 0; });
  assert.equal(await page.locator('[data-place-item]').count(), 0);
  const coordinates = await button.evaluate(element => {
    const map = element.closest('.placement-map').getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return { x: (rect.left + rect.width / 2 - map.left) / map.width, y: (rect.top + rect.height / 2 - map.top) / map.height };
  });
  assert.ok(Math.abs(coordinates.x - item.x) < .08, 'Saved horizontal item position changed');
  assert.ok(Math.abs(coordinates.y - item.y) < .08, 'Saved front/back item position changed');
}

async function catalog(page) {
  await route(page, '#/room/1', '#stage');
  await account(page, email);
  await page.locator('.room-empty a').waitFor({ state: 'visible' });
  await capture(page, 'desktop-empty-admin');
  await route(page, '#/manage/1', '#add-room-form');
  await fill(page, '#add-room-form', { name: '驗收用教具室' });
  const added = await submit(page, '#add-room-form', '/api/rooms');
  const room = added.data.rooms.find(room => room.name === '驗收用教具室');
  await page.waitForFunction(id => document.getElementById('manage-room-select').value === id, room.id);
  await fill(page, '#rename-room-form', { name: '尚未送出的房間草稿' });
  await fill(page, '#unit-form', { name: '驗收用層架', type: 'shelf', layers: 2 });
  const withUnit = await submit(page, '#unit-form', '/api/units');
  const unit = withUnit.data.units.find(unit => unit.room === room.id);
  await page.waitForFunction(() => /已儲存/.test(document.querySelector('#unit-form [role=status]').textContent));
  assert.equal(await page.locator('#rename-room-form [name=name]').inputValue(), '尚未送出的房間草稿');
  await page.locator('#manage-unit-select').selectOption(unit.code);
  await fill(page, '#unit-form', { name: '尚未送出的層架草稿' });
  await fill(page, '#item-form', { name: '驗收用圖卡', unit: unit.code, layer: 1, total: 3, assetNumber: 'QA-2026-0001', x: .3, y: .4 });
  const withItem = await submit(page, '#item-form', '/api/items');
  const item = withItem.data.items.find(item => item.name === '驗收用圖卡');
  await page.waitForFunction(() => /已儲存/.test(document.querySelector('#item-form [role=status]').textContent));
  assert.equal(await page.locator('#unit-form [name=name]').inputValue(), '尚未送出的層架草稿');
  assert.match(await page.locator('#item-form [role=status]').innerText(), /已儲存/);
  await page.locator('#manage-item-select').selectOption('');
  await fill(page, '#item-form', { name: '驗收用積木', unit: unit.code, layer: 1, total: 2, assetNumber: item.assetNumber, x: .7, y: .65 });
  await submit(page, '#item-form', '/api/items', 409);
  assert.match(await page.locator('#item-form [role=alert]').innerText(), /財產編號/);
  assert.equal(await page.locator('#item-form [name=name]').inputValue(), '驗收用積木');
  await capture(page, 'desktop-management-local-error');
  await fill(page, '#item-form', { assetNumber: 'QA-2026-0002' });
  await submit(page, '#item-form', '/api/items');
  await page.waitForFunction(() => /已儲存/.test(document.querySelector('#item-form [role=status]').textContent));
  assert.equal(await page.locator('#item-form [role=alert]').isVisible(), false);
  await capture(page, 'desktop-management-saved');
  return { room, unit, item };
}

async function arrange(page, profile, fixture) {
  await route(page, '#/room/' + fixture.room.id + '/item/' + fixture.item.id, '[data-view-item]');
  await page.locator('#stage canvas').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.stage-error').count(), 0, 'Real WebGL rendering failed');
  await page.locator('#arrange-toggle').click();
  await page.locator('[data-place-item]').first().waitFor({ state: 'visible' });
  const unitEndpoint = '/api/units/' + fixture.unit.code;
  const before = (await snapshot(page)).data.units.find(unit => unit.code === fixture.unit.code);
  const rotated = page.waitForResponse(response => new URL(response.url()).pathname === unitEndpoint && response.request().method() === 'PATCH');
  const rotate = page.locator('#rotate-right');
  await rotate.waitFor({ state: 'visible' });
  if (profile.touch) await rotate.tap();
  else await rotate.click();
  assert.equal((await rotated).status(), 200);
  const after = (await snapshot(page)).data.units.find(unit => unit.code === fixture.unit.code);
  assert.ok(Math.abs(after.rotation - before.rotation) > 1, 'Rotation control did not persist a quarter turn');
  if (!profile.touch) {
    const canvas = page.locator('#stage canvas');
    await canvas.focus();
    const moved = page.waitForResponse(response => new URL(response.url()).pathname === unitEndpoint && response.request().method() === 'PATCH');
    await canvas.press('ArrowRight');
    assert.equal((await moved).status(), 200);
    const anchor = await page.locator('.leader-lines circle').first().evaluate(dot => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      return { x: stage.left + Number(dot.getAttribute('cx')), y: stage.top + Number(dot.getAttribute('cy')) + 10 };
    });
    const dragged = page.waitForResponse(response => new URL(response.url()).pathname === unitEndpoint && response.request().method() === 'PATCH');
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    await page.mouse.move(anchor.x + 24, anchor.y + 8, { steps: 6 });
    await page.mouse.up();
    assert.equal((await dragged).status(), 200);
    const itemButton = page.locator('[data-place-item="' + fixture.item.id + '"]');
    await itemButton.scrollIntoViewIfNeeded();
    const itemRect = await itemButton.boundingBox();
    const itemSaved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/items/' + fixture.item.id && response.request().method() === 'PATCH');
    await page.mouse.move(itemRect.x + itemRect.width / 2, itemRect.y + itemRect.height / 2);
    await page.mouse.down();
    await page.mouse.move(itemRect.x + itemRect.width / 2 + 18, itemRect.y + itemRect.height / 2 + 12, { steps: 6 });
    await page.mouse.up();
    assert.equal((await itemSaved).status(), 200);
  }
  await page.locator('#arrange-toggle').click();
  const item = (await snapshot(page)).data.items.find(item => item.id === fixture.item.id);
  await readonlyPlacement(page, item);
  await page.reload();
  await readonlyPlacement(page, item);
  const persisted = (await snapshot(page)).data.units.find(unit => unit.code === fixture.unit.code);
  assert.equal(persisted.rotation, after.rotation);
  const bounds = await layout(page, profile, true);
  await capture(page, profile.name + '-admin-room');
  return bounds;
}

async function borrow(page, profile, fixture) {
  await route(page, '#/room/1', '#stage');
  await account(page, 'qa-' + profile.name + '@example.com', '驗收借用人');
  await page.locator('.room-empty').waitFor({ state: 'visible' });
  assert.match(await page.locator('.room-empty').innerText(), /請聯絡管理者/);
  assert.equal(await page.locator('.room-empty a[href^="#/manage"]').count(), 0);
  await capture(page, profile.name + '-empty-borrower');
  await route(page, '#/room/' + fixture.room.id + '/item/' + fixture.item.id, '[data-view-item]');
  await readonlyPlacement(page, (await snapshot(page)).data.items.find(item => item.id === fixture.item.id));
  assert.equal(await page.locator('#arrange-toggle').count(), 0);
  const bounds = await layout(page, profile, true);
  await capture(page, profile.name + '-borrower-room');
  await page.locator('.panel-header a[href^="#/borrow/"]').click();
  await page.locator('#borrow-form').waitFor({ state: 'visible' });
  const id = fixture.item.id;
  await page.locator('#check-' + id).check();
  const today = (await snapshot(page)).state.today;
  await page.locator('#end-' + id).fill(today);
  await submit(page, '#borrow-form', '/api/actions');
  await page.waitForURL('**/#/result/*');
  const reservation = await snapshot(page);
  const reserved = reservation.state.records.find(record => record.itemId === id && record.userId === reservation.user.id);
  assert.ok(reserved, 'Borrow reservation not stored');
  await route(page, '#/scan/item/' + id, '[data-scan-action=pickup]');
  await page.locator('[data-scan-action=pickup]').click();
  const pickup = page.waitForResponse(response => new URL(response.url()).pathname === '/api/actions');
  await page.locator('[data-pickup]').click();
  assert.equal((await pickup).status(), 200);
  await page.waitForURL('**/#/result/*');
  await route(page, '#/scan/item/' + id + '/return', '[data-return]');
  await submit(page, '[data-return]', '/api/actions');
  await page.waitForURL('**/#/result/*');
  const final = await snapshot(page);
  const record = final.state.records.find(record => record.itemId === id && record.userId === final.user.id);
  assert.equal(record.picked, 1);
  assert.equal(record.returned, 1);
  await page.reload();
  assert.equal((await snapshot(page)).state.records.find(entry => entry.id === record.id).returned, 1);
  await route(page, '#/qr', '.qr-code img');
  assert.equal(await page.locator('.qr-code img').count(), 3);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.qr-code img')).every(image => image.complete && image.naturalWidth > 0));
  await capture(page, profile.name + '-qr');
  return bounds;
}

(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  folder = mkdtempSync(path.join(tmpdir(), 'ezstorage-browser-qa-'));
  app = createApp({ DATABASE_PATH: path.join(folder, 'qa.sqlite'), ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ALLOW_REGISTRATION: 'true', SEED_DEMO: 'false', SMTP_HOST: '', SMTP_USER: '', PUBLIC_URL: '', COOKIE_SECURE: 'false', scheduler: false });
  server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
    candidate.once('error', reject);
  });
  baseURL = 'http://127.0.0.1:' + server.address().port;
  let fixture;
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.touch, hasTouch: profile.touch, reducedMotion: 'reduce', locale: 'zh-TW' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => report.errors.push({ profile: profile.name, message: error.message }));
    if (!fixture) fixture = await catalog(page);
    else { await route(page, '#/room/1', '#stage'); await account(page, email); }
    const adminBounds = await arrange(page, profile, fixture);
    await page.locator('#account').click();
    const logout = page.waitForResponse(response => new URL(response.url()).pathname === '/api/logout');
    await page.locator('#sign-out').click();
    assert.equal((await logout).status(), 200);
    await page.locator('#account-dialog').waitFor({ state: 'hidden' });
    const borrowerBounds = await borrow(page, profile, fixture);
    report.profiles.push({ name: profile.name, viewport: profile.viewport, adminBounds, borrowerBounds, status: 'PASS' });
    await context.close();
    console.log('PASS ' + profile.name);
  }
  assert.deepEqual(report.errors, [], 'Browser page errors');
  report.status = 'PASS';
})().catch(error => {
  report.status = browser && server ? 'FAIL' : 'BLOCKED';
  report.failure = error.message;
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (app) app.locals.close();
  if (folder) rmSync(folder, { recursive: true, force: true });
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Browser acceptance report: ' + path.join(output, 'report.json'));
});
