import { startFrontend } from './browser-fixture.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { Item, Room, Unit } from '../shared/model.ts';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '..');
const clone = structuredClone;
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

async function management(t: TestContext, empty = false) {
  const dom = new JSDOM(fs.readFileSync(root + '/prototype/index.html', 'utf8'), { url: 'http://localhost:3000/#/manage/1', runScripts: 'outside-only' });
  const w = dom.window;
  t.after(() => w.close());
  w.scrollTo = () => {};
  const snapshot = {
    data: {
      today: '2026-11-18', people: [], types: { shelf: '層架', box: '收納箱', cabinet: '櫃子', drawer: '抽屜櫃' },
      rooms: empty ? [] : [{ id: '1', name: '教具室' }, { id: '2', name: '治療室' }],
      units: empty ? [] : [
        { code: 'A1', name: '圖卡櫃', room: '1', type: 'shelf', layers: 2, w: 2, h: 2, d: 1, x: -2, z: 0, rotation: 0 },
        { code: 'B1', name: '積木櫃', room: '1', type: 'cabinet', layers: 3, w: 2, h: 2, d: 1, x: 1, z: 0, rotation: 0 },
        { code: 'C1', name: '治療櫃', room: '2', type: 'shelf', layers: 2, w: 2, h: 2, d: 1, x: 0, z: 0, rotation: 0 }
      ],
      items: empty ? [] : [
        { id: 'a', name: '圖卡', unit: 'A1', layer: 1, total: 2, assetNumber: '', code: 'A1-1-a', x: .2, y: .3, image: '' },
        { id: 'b', name: '積木', unit: 'B1', layer: 2, total: 3, assetNumber: '', code: 'B1-2-b', x: .6, y: .4, image: '' },
        { id: 'c', name: '握力球', unit: 'C1', layer: 1, total: 4, assetNumber: '', code: 'C1-1-c', x: .4, y: .5, image: '' }
      ]
    },
    state: { today: '2026-11-18', records: [], events: [], requests: [], handovers: [], mails: [], receipts: [] },
    user: { id: 'admin', name: '管理者', email: 'admin@example.com', role: 'admin' }, revision: 0
  };
  const network: { fail: string | null; pause: string | null; release: (() => void) | null; calls: { url: string; body: Record<string, unknown> }[] } = { fail: null, pause: null, release: null, calls: [] };
  w.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    network.calls.push({ url, body });
    if (network.pause === url) {
      network.pause = null;
      await new Promise<void>(resolve => { network.release = resolve; });
    }
    if (network.fail === url) {
      network.fail = null;
      return { ok: false, json: async () => ({ error: '財產編號已有人使用，請修改後重試。' }) };
    }
    if (options.method === 'PATCH') {
      const [, , kind, id] = url.split('/');
      const rows: (Room | Item | Unit)[] = snapshot.data[kind as 'rooms' | 'units' | 'items'];
      Object.assign(rows.find(row => ('id' in row ? row.id : row.code) === id)!, body);
      snapshot.revision++;
    } else if (options.method === 'POST') {
      if (url === '/api/rooms') { snapshot.data.rooms.push({ id: String(snapshot.data.rooms.length + 1), name: body.name }); }
      if (url === '/api/units') { snapshot.data.units.push({ code: 'N' + snapshot.data.units.length, ...body }); }
      if (url === '/api/items') { const id = 'new-' + snapshot.data.items.length; snapshot.data.items.push({ id, code: body.unit + '-' + body.layer + '-' + id, image: '', ...body }); }
      snapshot.revision++;
    }
    return { ok: true, json: async () => clone(snapshot) };
  };
  await startFrontend(w);
  function form(id: string) { return w.document.getElementById(id); }
  function edit(id: string, name: string, value: string) {
    const input = form(id).elements[name] as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  async function select(id: string, value: string) {
    form(id).value = value;
    form(id).dispatchEvent(new w.Event('change', { bubbles: true }));
    await tick();
  }
  async function submit(id: string) {
    form(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
  }
  return { w, snapshot, network, form, edit, select, submit };
}

test('management retains independent room, new-room, unit and item drafts across selectors and rooms', async t => {
  const { form, edit, select } = await management(t);
  assert.equal(form('unit-form').querySelector('details')!.open, false);
  assert.equal(form('item-form').querySelector('details')!.open, false);
  assert.match(form('unit-form').textContent, /模型尺寸（房間單位）/);
  assert.match(form('item-form').textContent, /0 是左側／後方，1 是右側／前方/);
  edit('rename-room-form', 'name', '教具室草稿');
  edit('add-room-form', 'name', '新增房間草稿');
  edit('unit-form', 'name', '新家具草稿');
  edit('unit-form', 'w', '2.75');
  form('unit-form').querySelector('details')!.open = true;
  edit('item-form', 'name', '新物品草稿');
  edit('item-form', 'x', '.73');
  form('item-form').querySelector('details')!.open = true;
  await select('manage-unit-select', 'A1');
  edit('unit-form', 'name', '圖卡櫃草稿');
  edit('unit-form', 'rotation', '45');
  await select('manage-unit-select', 'B1');
  edit('unit-form', 'name', '積木櫃草稿');
  await select('manage-unit-select', 'A1');
  assert.equal(form('unit-form').elements.name.value, '圖卡櫃草稿');
  assert.equal(form('unit-form').elements.rotation.value, '45');
  assert.equal(form('item-form').elements.name.value, '新物品草稿');
  assert.equal(form('item-form').elements.x.value, '.73');
  await select('manage-item-select', 'a');
  edit('item-form', 'name', '圖卡草稿');
  edit('item-form', 'total', '7');
  await select('manage-item-select', 'b');
  edit('item-form', 'name', '積木草稿');
  await select('manage-item-select', 'a');
  assert.equal(form('item-form').elements.name.value, '圖卡草稿');
  assert.equal(form('item-form').elements.total.value, '7');
  await select('manage-room-select', '2');
  edit('rename-room-form', 'name', '治療室草稿');
  edit('unit-form', 'name', '另一間的新家具');
  edit('item-form', 'name', '另一間的新物品');
  await select('manage-room-select', '1');
  assert.equal(form('manage-unit-select').value, 'A1');
  assert.equal(form('manage-item-select').value, 'a');
  assert.equal(form('rename-room-form').elements.name.value, '教具室草稿');
  assert.equal(form('add-room-form').elements.name.value, '新增房間草稿');
  assert.equal(form('unit-form').elements.name.value, '圖卡櫃草稿');
  assert.equal(form('item-form').elements.name.value, '圖卡草稿');
  await select('manage-unit-select', '');
  await select('manage-item-select', '');
  assert.equal(form('unit-form').elements.name.value, '新家具草稿');
  assert.equal(form('unit-form').elements.w.value, '2.75');
  assert.equal(form('unit-form').querySelector('details')!.open, true);
  assert.equal(form('item-form').elements.name.value, '新物品草稿');
  assert.equal(form('item-form').elements.x.value, '.73');
  assert.equal(form('item-form').querySelector('details')!.open, true);
  await select('manage-room-select', '2');
  assert.equal(form('rename-room-form').elements.name.value, '治療室草稿');
  assert.equal(form('unit-form').elements.name.value, '另一間的新家具');
  assert.equal(form('item-form').elements.name.value, '另一間的新物品');
});

test('successful saves clear only the submitted draft and announce beside that form', async t => {
  const { snapshot, form, edit, select, submit } = await management(t);
  edit('rename-room-form', 'name', '已改名的房間');
  edit('add-room-form', 'name', '新的房間');
  edit('unit-form', 'name', '新的家具');
  edit('unit-form', 'w', '2.7');
  edit('item-form', 'name', '新的教具');
  edit('item-form', 'total', '6');
  await submit('rename-room-form');
  assert.equal(snapshot.data.rooms[0].name, '已改名的房間');
  assert.equal(form('rename-room-form').querySelector('[role=status]')!.textContent, '已儲存至資料庫。');
  assert.equal(form('unit-form').querySelector('[role=status]')!.textContent, '');
  assert.equal(form('unit-form').elements.name.value, '新的家具');
  assert.equal(form('item-form').elements.total.value, '6');
  assert.equal(form('add-room-form').elements.name.value, '新的房間');
  await submit('unit-form');
  assert.equal(snapshot.data.units.at(-1)!.name, '新的家具');
  assert.equal(snapshot.data.units.at(-1)!.w, 2.7);
  assert.equal(form('unit-form').elements.name.value, '');
  assert.equal(form('unit-form').elements.w.value, '1.5');
  assert.equal(form('unit-form').querySelector('[role=status]')!.textContent, '已儲存至資料庫。');
  assert.equal(form('item-form').elements.name.value, '新的教具');
  await submit('item-form');
  assert.equal(snapshot.data.items.at(-1)!.name, '新的教具');
  assert.equal(form('item-form').elements.name.value, '');
  assert.equal(form('item-form').elements.total.value, '1');
  assert.equal(form('item-form').querySelector('[role=status]')!.textContent, '已儲存至資料庫。');
  edit('unit-form', 'name', '尚未儲存的家具');
  assert.equal(form('unit-form').querySelector('[role=status]')!.textContent, '');
  edit('item-form', 'name', '尚未儲存的教具');
  await submit('add-room-form');
  assert.equal(snapshot.data.rooms.at(-1)!.name, '新的房間');
  assert.equal(form('add-room-form').elements.name.value, '');
  assert.equal(form('add-room-form').querySelector('[role=status]')!.textContent, '已儲存至資料庫。');
  await select('manage-room-select', '1');
  assert.equal(form('unit-form').elements.name.value, '尚未儲存的家具');
  assert.equal(form('item-form').elements.name.value, '尚未儲存的教具');
});

test('failed saves retain values and show errors in the submitting form after switching items', async t => {
  const { snapshot, network, form, edit, select, submit } = await management(t);
  await select('manage-item-select', 'a');
  edit('item-form', 'name', '保留的名稱');
  edit('item-form', 'assetNumber', 'DUPLICATE');
  edit('item-form', 'x', '.81');
  form('item-form').querySelector('details')!.open = true;
  edit('unit-form', 'name', '家具草稿');
  network.fail = '/api/items/a';
  await submit('item-form');
  assert.match(form('item-form').querySelector('[role=alert]')!.textContent, /請修改後重試/);
  assert.equal(form('form-error').hidden, true);
  assert.equal(form('unit-form').querySelector('[role=alert]'), null);
  assert.equal(form('item-form').elements.name.value, '保留的名稱');
  assert.equal(form('item-form').elements.assetNumber.value, 'DUPLICATE');
  assert.equal(form('item-form').elements.x.value, '.81');
  assert.equal(form('item-form').querySelector('button')!.disabled, false);
  assert.equal(snapshot.data.items[0].name, '圖卡');
  await select('manage-item-select', 'b');
  await select('manage-item-select', 'a');
  assert.equal(form('item-form').querySelector('details')!.open, true);
  assert.equal(form('item-form').elements.assetNumber.value, 'DUPLICATE');
  assert.match(form('item-form').querySelector('[role=alert]')!.textContent, /請修改後重試/);
  edit('item-form', 'assetNumber', 'VALID');
  await submit('item-form');
  assert.equal(snapshot.data.items[0].assetNumber, 'VALID');
  assert.equal(form('item-form').querySelector('[role=alert]'), null);
  assert.equal(form('item-form').querySelector('[role=status]')!.textContent, '已儲存至資料庫。');
  assert.equal(form('unit-form').elements.name.value, '家具草稿');
});

test('a save finishing after navigation leaves the current page intact and restores local feedback on return', async t => {
  const { w, network, form, edit, select, submit } = await management(t);
  await select('manage-item-select', 'a');
  edit('item-form', 'name', '非同步儲存的圖卡');
  edit('unit-form', 'name', '保留的家具草稿');
  network.pause = '/api/items/a';
  await submit('item-form');
  assert.equal(form('item-form').elements.name.disabled, true);
  assert.equal(form('item-form').querySelector('[role=status]')!.textContent, '儲存中…');
  w.location.hash = '#/numbering';
  await tick();
  network.release!();
  await tick();
  assert.equal(w.location.hash, '#/numbering');
  assert.equal(w.document.querySelector('h1')!.textContent, '財產編號規則參考');
  w.location.hash = '#/manage/1';
  await tick();
  assert.equal(form('manage-item-select').value, 'a');
  assert.equal(form('item-form').elements.name.value, '非同步儲存的圖卡');
  assert.equal(form('item-form').elements.name.disabled, false);
  assert.equal(form('item-form').querySelector('[role=status]')!.textContent, '已儲存至資料庫。');
  assert.equal(form('unit-form').elements.name.value, '保留的家具草稿');
});

test('a pending save keeps the currently selected item and its edits intact', async t => {
  const { network, form, edit, select, submit } = await management(t);
  await select('manage-item-select', 'a');
  edit('item-form', 'name', '第一筆已儲存');
  network.pause = '/api/items/a';
  await submit('item-form');
  await select('manage-item-select', 'b');
  edit('item-form', 'name', '第二筆尚未儲存');
  network.release!();
  await tick();
  assert.equal(form('manage-item-select').value, 'b');
  assert.equal(form('item-form').elements.name.value, '第二筆尚未儲存');
  assert.equal(form('item-form').querySelector('[role=status]')!.textContent, '');
  await select('manage-item-select', 'a');
  assert.equal(form('item-form').elements.name.value, '第一筆已儲存');
  assert.equal(form('item-form').querySelector('[role=status]')!.textContent, '已儲存至資料庫。');
});

test('management can add the first room when no rooms or furniture exist', async t => {
  const { snapshot, form, edit, submit } = await management(t, true);
  assert.equal(form('rename-room-form'), null);
  assert.equal(form('unit-form'), null);
  assert.equal(form('item-form'), null);
  edit('add-room-form', 'name', '第一間教具室');
  await submit('add-room-form');
  assert.equal(snapshot.data.rooms[0].name, '第一間教具室');
  assert.equal(form('rename-room-form').elements.name.value, '第一間教具室');
  assert.equal(form('add-room-form').elements.name.value, '');
});

for (const fails of [false, true]) {
  test(`returning to a pending form updates its ${fails ? 'error' : 'success'} without leaving it disabled`, async t => {
    const { network, form, edit, select, submit } = await management(t);
    await select('manage-item-select', 'a');
    edit('item-form', 'name', '等待完成的圖卡');
    network.pause = '/api/items/a';
    if (fails) { network.fail = '/api/items/a'; }
    await submit('item-form');
    await select('manage-item-select', 'b');
    await select('manage-item-select', 'a');
    assert.equal(form('item-form').elements.name.disabled, true);
    network.release!();
    await tick();
    assert.equal(form('item-form').elements.name.disabled, false);
    assert.equal(form('item-form').elements.name.value, '等待完成的圖卡');
    assert.equal(form('manage-item-select').value, 'a');
    if (fails) { assert.match(form('item-form').querySelector('[role=alert]')!.textContent, /請修改後重試/); }
    else { assert.equal(form('item-form').querySelector('[role=status]')!.textContent, '已儲存至資料庫。'); }
  });
}
