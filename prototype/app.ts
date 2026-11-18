import { demo, qrSource, request } from './transport.ts';
import type { ApiBody, Engine, mailView, view } from '../shared/api.ts';
import type { Catalog, Item, Loan, Receipt, Unit } from '../shared/model.ts';
import type { RoomViewHandle } from './room3d.ts';

const demoUI: { credentials: string; reset(): Promise<void> } | null = demo as { credentials: string; reset(): Promise<void> } | null;
type View = ReturnType<typeof view>;
const actions = ['makeBorrow', 'pickup', 'returnQuantity', 'cancelReservation', 'rescheduleReservation', 'extend', 'respondExtension', 'sendHandover', 'respondHandover'] as const;
type Action = typeof actions[number];
type ClientEngine = Omit<Engine, Action | 'updateAssetNumber'> & {
  [K in Action]: (...args: Parameters<Engine[K]>) => Promise<Receipt>;
} & { updateAssetNumber(id: string, value: string): Promise<Item> };
interface ScanContext { unit: Unit; prechecked: string | null; base: string }
interface Draft {
  values?: Record<string, string>; open?: boolean; message?: string; error?: boolean;
  pending?: boolean; update?(saved: boolean): void;
}
type FieldControl = HTMLInputElement | HTMLSelectElement | HTMLButtonElement;
type NamedForm = HTMLFormElement & { elements: Record<string, HTMLInputElement> };

// Static page markup and render templates provide these IDs before use.
function element<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error); }

export default (async function () {
  'use strict';
  var E: ClientEngine;
  let data!: Catalog;
  var editing = false;
  var busy = false;
  var registrationEnabled = false;
  var revision: number;
  var receiptRooms: Record<string, string> = {};
  function applySnapshot(value: View) {
    if (!value.data || !value.state) { return; }
    data = value.data;
    registrationEnabled = !!value.registrationEnabled;
    revision = value.revision;
    value.state.user = value.user || value.state.user || null;
    E = window.createEngine(data, value.state) as unknown as ClientEngine;
    window.EZ = E;
    window.EZData = data;
    actions.forEach(function (action) {
      Object.assign(E, { [action]: async function (...args: [unknown?, unknown?, { itemId?: string }[]?, unknown?]) {
        var related = action === 'respondExtension' ? E.state.requests.find(function (r) { return r.id === args[0]; }) : action === 'respondHandover' ? E.state.handovers.find(function (r) { return r.id === args[0]; }) : null;
        var record = E.state.records.find(function (r) { return r.id === (related ? related.loanId : args[0]); });
        var inventory = action === 'makeBorrow' ? E.item(args[2]?.[0]?.itemId) : record ? E.item(record.itemId) : null;
        var unit = inventory ? E.unit(inventory.unit)! : null;
        var value = await request('/api/actions', 'POST', { action: action, args: args });
        if (value.result && unit) { receiptRooms[value.result.id] = unit.room; }
        applySnapshot(value);
        return value.result!;
      } });
    });
    E.updateAssetNumber = async function (id, value) { await save('/api/items/' + id, 'PATCH', { assetNumber: value }); return E.item(id)!; };
    element('account').textContent = E.state.user ? E.state.user.name : registrationEnabled ? '登入／註冊' : '登入';
    document.querySelector<HTMLElement>('.rooms')!.innerHTML = data.rooms.map(function (room) { return '<a href="#/room/' + room.id + '" data-room="' + room.id + '">' + escape(room.name) + '</a>'; }).join('');
    element<HTMLInputElement>('room-picker').innerHTML = data.rooms.map(function (room) { return '<option value="' + room.id + '">' + escape(room.name) + '</option>'; }).join('');
    if (chosenRoom) { element<HTMLInputElement>('room-picker').value = chosenRoom ?? ''; }
    element('manage-link').hidden = !isAdmin();
  }
  function isAdmin() { return !!(E && E.state.user && E.state.user.role === 'admin'); }
  function nextItemPosition(unitCode: string, layer: number) { return window.EZPlacement.nextItemPosition(data.items, unitCode, layer); }
  async function save(path: string, method: string, body: ApiBody) {
    var value = await request(path, method, Object.assign({}, body, { revision: revision }));
    applySnapshot(value);
    return value;
  }
  try { applySnapshot(await request('/api/state')); }
  catch (error) { element('app').innerHTML = '<div class="page narrow"><h1>無法載入資料</h1><p role="alert">' + escape(messageOf(error)) + '</p><button class="button" id="reconnect">重新連線</button></div>'; element('reconnect').addEventListener('click', function () { location.reload(); }); return; }
  var app = element('app');
  if (demoUI) {
    app.addEventListener('click', async event => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-demo-reset]')) return;
      if (confirm('確定重置 Demo 資料？')) {
        await demoUI.reset();
        history.replaceState(null, '', location.pathname + location.search);
        location.reload();
      }
    });
  }
  var dialog = element<HTMLDialogElement>('account-dialog');
  var roomView: RoomViewHandle | null = null;
  var chosenRoom = data.rooms[0] ? data.rooms[0].id : null;
  var chosenUnit: string | null = null;
  var chosenLayer: number | null = null;
  var searchQuery = '';
  var search = element<HTMLInputElement>('inventory-search');
  var clear = element('clear-search');
  var afterLogin: (() => void) | null = null;
  element<HTMLInputElement>('room-picker').addEventListener('change', function () { go('#/room/' + this.value); });
  document.querySelector<HTMLDetailsElement>('.service-menu')!.addEventListener('click', function (event) {
    if ((event.target as HTMLElement).closest('a')) { this.open = false; }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { document.querySelector<HTMLDetailsElement>('.service-menu')!.open = false; }
  });
  function escape(value: unknown) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]; }); }
  function shortDate(value: string) { return value.slice(5).replace('-', '/'); }
  function dateRange(r: Loan, start?: string) { return '<span class="num date-range">' + shortDate(start || r.start) + ' – ' + shortDate(r.end) + '</span>'; }
  function go(hash: string) { if (location.hash === hash) { route(); } else { location.hash = hash; } }
  function footer() { return '<div class="prototype-note"><span>EzStorage · 自行架設的教具借用系統</span><a href="#/numbering">財產編號規則參考</a>' + (E.state.user ? '<a href="#/mail">我的通知</a>' : '') + (demoUI ? '<button type="button" class="text-button" data-demo-reset>重置 Demo 資料</button>' : '') + '</div>'; }
  function page(title: string, subtitle: string, body: string, narrow = false) {
    app.innerHTML = '<div class="page' + (narrow ? ' narrow' : '') + '"><div class="page-header"><div><h1>' + escape(title) + '</h1>' + (subtitle ? '<p>' + escape(subtitle) + '</p>' : '') + '</div></div>' + body + footer() + '</div>';
  }
  function showReceipt(receipt: Receipt) { go('#/result/' + receipt.id); }
  function showError(message: string, target?: HTMLElement | null) {
    target = target || element('form-error');
    if (target) { target.textContent = message; target.hidden = false; target.setAttribute('role', 'alert'); }
  }
  function layoutMessage(message: string, error = false) {
    var status = element('layout-status');
    if (!status) { return; }
    status.textContent = message;
    status.classList.toggle('error', !!error);
  }
  async function handle(action: () => Receipt | Promise<Receipt>) {
    if (busy) { return; }
    busy = true;
    var controls = Array.from(app.querySelectorAll<FieldControl>('button:not(:disabled), input:not(:disabled)'));
    controls.forEach(function (control) { control.disabled = true; });
    try { showReceipt(await action()); } catch (error) { showError(messageOf(error)); }
    finally { busy = false; controls.forEach(function (control) { control.disabled = false; }); }
  }
  function icon(name: string) {
    var paths: Record<string, string> = { borrow: '<path d="M6 5h12v16H6zM9 5V2h6v3M9 10h6m-6 4h6m-6 4h4"/>', pickup: '<path d="M3 8h18v12H3zM3 8l4-5h10l4 5M12 3v11m-4-4 4 4 4-4"/>', return: '<path d="M3 8h18v12H3zM3 8l4-5h10l4 5M12 16V9m-4 4 4-4 4 4"/>', minus: '<path d="M4 12h16"/>', plus: '<path d="M4 12h16M12 4v16"/>' };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
  }
  function quantityInput(key: string, value: number, maximum: number, label: string) {
    return '<div class="quantity"><button type="button" data-step="-1" aria-label="減少' + escape(label) + '">' + icon('minus') + '</button><input id="' + key + '" type="number" min="1" max="' + maximum + '" step="1" value="' + value + '" required aria-label="' + escape(label) + '"><button type="button" data-step="1" aria-label="增加' + escape(label) + '">' + icon('plus') + '</button></div>';
  }
  function bindSteppers(container: HTMLElement, recalculate: () => void) {
    container.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(function (button) {
      button.addEventListener('click', function () {
        var input = button.parentElement!.querySelector('input')!;
        var maximum = Number(input.max);
        var next = Number(input.value) + Number(button.dataset.step);
        input.value = String(Math.max(maximum < 1 ? 0 : 1, Math.min(maximum, next)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    container.addEventListener('input', recalculate);
    container.addEventListener('change', recalculate);
  }
  function syncStepper(input: HTMLInputElement) {
    var buttons = input.parentElement!.querySelectorAll('button');
    buttons[0].disabled = Number(input.value) <= 1 || Number(input.max) < 1;
    buttons[1].disabled = Number(input.value) >= Number(input.max);
  }
  function chooseAccount(callback: () => void) {
    afterLogin = callback;
    element('account-heading').textContent = E.state.user ? '我的帳號' : '登入 EzStorage';
    element('accounts').innerHTML = E.state.user ? '<p>' + escape(E.state.user.name) + '<br>' + escape(E.state.user.email) + '</p><button class="button secondary" id="sign-out">登出</button>' : '<form id="account-form" class="account-form"><label class="field" id="register-name-field" hidden>姓名<input name="name" autocomplete="name" maxlength="80"></label><label class="field">Email<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label class="field">密碼<input name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label><p class="muted">密碼至少 12 個字元。' + (demoUI ? ' ' + escape(demoUI.credentials) : '管理者帳號由部署時建立。') + '</p><p class="form-error" id="account-error" role="alert" hidden></p><button class="button" type="submit" id="account-submit">登入</button><button class="text-button" type="button" id="toggle-register">建立借用人帳號</button></form>';
    var logout = element('sign-out');
    if (logout) { logout.addEventListener('click', async function () { try { await request('/api/logout', 'POST', {}); applySnapshot(await request('/api/state')); editing = false; dialog.close(); route(); } catch (error) { logout.textContent = messageOf(error); } }); }
    var form = element<NamedForm>('account-form');
    if (form) {
      var registering = false;
      element('toggle-register').hidden = !registrationEnabled;
      element('toggle-register').addEventListener('click', function () {
        registering = !registering;
        element('register-name-field').hidden = !registering;
        form.elements.name.required = registering;
        form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
        element('account-heading').textContent = registering ? '建立借用人帳號' : '登入 EzStorage';
        element<HTMLButtonElement>('account-submit').textContent = registering ? '註冊' : '登入';
        this.textContent = registering ? '已有帳號，返回登入' : '建立借用人帳號';
      });
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var button = element<HTMLButtonElement>('account-submit');
        button.disabled = true;
        try {
          applySnapshot(await request(registering ? '/api/register' : '/api/login', 'POST', { name: form.elements.name.value, email: form.elements.email.value, password: form.elements.password.value }));
          var callback = afterLogin;
          dialog.close();
          if (callback) { callback(); }
        } catch (error) { showError(messageOf(error), element('account-error')); }
        finally { button.disabled = false; }
      });
    }
    if (!dialog.open) { dialog.showModal(); }
  }
  dialog.addEventListener('close', function () { afterLogin = null; });
  element('account').addEventListener('click', function () { chooseAccount(route); });
  function requireLogin() {
    if (E.state.user) { return true; }
    page('登入 EzStorage', '借用、預約、領取與歸還都需要登入。', '<button class="button" id="sign-in">登入／註冊</button>', true);
    element('sign-in').addEventListener('click', function () { chooseAccount(route); });
    chooseAccount(route);
    return false;
  }
  function assetDetails(inventory: Item) {
    return '<div class="asset-display"><p>財產編號 <span class="num asset-number">' + (inventory.assetNumber ? escape(inventory.assetNumber) : '<span class="muted">尚未填寫</span>') + '</span></p>' + (isAdmin() ? '<button type="button" class="text-button" data-edit-asset="' + inventory.id + '" aria-label="編輯' + escape(inventory.name) + '的財產編號">編輯</button>' : '') + '</div>';
  }
  function bindAssetEditors(container: HTMLElement) {
    container.querySelectorAll<HTMLElement>('[data-edit-asset]').forEach(function (button) {
      button.addEventListener('click', function () {
        var inventory = E.item(button.dataset.editAsset)!;
        var details = button.closest<HTMLElement>('.asset-details')!;
        details.innerHTML = '<form class="asset-form"><label class="field" for="asset-' + inventory.id + '">財產編號<input id="asset-' + inventory.id + '" type="text" value="' + escape(inventory.assetNumber) + '" maxlength="80" autocomplete="off" spellcheck="false" aria-describedby="asset-hint-' + inventory.id + '"></label><p class="muted" id="asset-hint-' + inventory.id + '">' + (demoUI ? '可留空。' : '儲存至資料庫，可留空。') + '<a href="#/numbering">編號規則參考</a></p><div class="asset-actions"><button type="submit" class="button">儲存</button><button type="button" class="button secondary" data-cancel-asset>取消</button></div><p class="form-error" hidden></p></form>';
        var input = details.querySelector('input')!;
        input.focus({ preventScroll: true });
        function closeEditor(message?: string) {
          details.innerHTML = assetDetails(inventory);
          bindAssetEditors(details);
          var focus = details.querySelector('button');
          if (focus) { focus.focus({ preventScroll: true }); }
          element('asset-status').textContent = message || '';
        }
        details.querySelector('form')!.addEventListener('submit', async function (event) {
          event.preventDefault();
          try {
            await E.updateAssetNumber(inventory.id, input.value);
            inventory = E.item(inventory.id)!;
            closeEditor(inventory.name + '的財產編號已' + (inventory.assetNumber ? '儲存。' : '清空。'));
          } catch (error) { showError(messageOf(error), details.querySelector<HTMLElement>('.form-error')); }
        });
        details.querySelector<HTMLElement>('[data-cancel-asset]')!.addEventListener('click', function () { closeEditor(); });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); closeEditor(); }
        });
      });
    });
  }
  function itemPanel(inventory: Item) {
    var records = E.state.records.filter(function (r) { return r.itemId === inventory.id; });
    var current = records.filter(function (r) { return E.held(r) > 0 || E.awaitingToday(r) > 0; });
    var next = records.filter(function (r) { return E.pending(r) > 0 && E.reservationStart(r) > E.state.today; }).sort(function (a, b) { return E.reservationStart(a).localeCompare(E.reservationStart(b)); });
    var out = E.outToday(inventory.id);
    function borrowerRow(r: Loan, quantity: number, start: string, waiting?: boolean) {
      var days = E.daysBetween(E.state.today, r.end);
      return '<div class="borrower-row"><span>' + escape(r.name) + ' · <span class="num">' + quantity + '</span> 件' + (waiting ? '（待領取）' : '') + '</span>' + dateRange(r, start) + '<span class="num days' + (days < 0 ? ' late' : '') + '" aria-label="距離歸還 ' + days + ' 天">' + days + ' 天</span></div>';
    }
    return '<article class="inventory-item" data-inventory="' + inventory.id + '" tabindex="-1" aria-label="' + escape(inventory.name) + '"><div class="item-image" role="img" aria-label="' + escape(inventory.name + '，示範插圖；' + out + ' 件已領取或今天待領取') + '">' + inventory.image + '<div class="dark" style="height:' + Math.min(100, out / inventory.total * 100) + '%"></div></div><div class="item-info"><h3>' + escape(inventory.name) + '<span class="remaining num">' + E.remaining(inventory.id) + ' <small>/ ' + inventory.total + ' 剩餘</small></span></h3><div class="asset-details">' + assetDetails(inventory) + '</div>' + (current.length ? current.map(function (r) {
      return (E.held(r) ? borrowerRow(r, E.held(r), r.start, false) : '') + (E.awaitingToday(r) ? borrowerRow(r, E.awaitingToday(r), E.reservationStart(r), true) : '');
    }).join('') : '<p class="empty">目前沒有人借用</p>') + (next.length ? '<p class="next-label">接下來</p>' + next.map(function (r) { return '<div class="next-row"><span>' + escape(r.name) + ' · <span class="num">' + E.pending(r) + '</span> 件</span>' + dateRange(r, E.reservationStart(r)) + '</div>'; }).join('') : '') + '</div></article>';
  }
  function placementTray(inventory: Item[], unit: Unit, layer: number) {
    var canEdit = editing && isAdmin();
    var items = inventory.filter(function (item) { return item.layer === layer; });
    if (!items.length && !canEdit) { return ''; }
    return '<div class="shelf-map"><p class="shelf-back">後側</p><div class="placement-map' + (canEdit ? ' item-drop-zone' : '') + '"' + (canEdit ? ' data-drop-unit="' + unit.code + '" data-drop-layer="' + layer + '"' : '') + ' role="group" aria-label="第 ' + layer + ' 層的物品位置，圖上方是後側，下方是前側">' + items.map(function (item, index) {
      return '<button type="button" class="placed-item' + (canEdit ? '' : ' readonly') + '" ' + (canEdit ? 'data-place-item' : 'data-view-item') + '="' + item.id + '" style="left:clamp(43px,' + (item.x === undefined ? 18 + (index % 3) * 32 : item.x * 100) + '%,calc(100% - 43px));top:clamp(45px,' + (item.y === undefined ? 25 + (Math.floor(index / 3) % 2) * 45 : item.y * 100) + '%,calc(100% - 45px))" aria-label="' + (canEdit ? '拖曳擺設 ' : '查看 ') + escape(item.name) + (canEdit ? '，方向鍵微調位置' : '，剩餘 ' + E.remaining(item.id) + ' 件') + '"><span class="placed-item-image">' + (item.image || '') + '</span><span>' + escape(item.name) + '</span>' + (canEdit ? '' : '<small>剩餘 ' + E.remaining(item.id) + ' 件</small>') + '</button>';
    }).join('') + '</div><p class="shelf-front">前側</p>' + (canEdit ? '<p class="tray-hint">拖曳調整位置或移到另一層；每次放開後自動儲存。</p>' : '') + '</div>';
  }
  function syncRoomControls() {
    var unit = E.unit(chosenUnit);
    document.querySelectorAll<HTMLButtonElement>('[data-rotate]').forEach(function (button) { button.disabled = !editing || !unit || !!unit.parent || busy; });
    var overview = element('overview-toggle');
    if (overview) { overview.hidden = !unit || editing; }
    element<HTMLInputElement>('room-picker').value = chosenRoom ?? '';
  }
  function bindPlacement(panel: HTMLElement) {
    panel.querySelectorAll<HTMLElement>('[data-place-item]').forEach(function (button) {
      var original: { x: number; y: number; left: string; top: string } | null = null;
      var moved = false;
      button.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) { return; }
        original = { x: event.clientX, y: event.clientY, left: button.style.left, top: button.style.top };
        moved = false;
        button.setPointerCapture(event.pointerId);
        button.classList.add('dragging');
      });
      button.addEventListener('pointermove', function (event) {
        if (!original || !button.hasPointerCapture(event.pointerId)) { return; }
        moved = moved || Math.hypot(event.clientX - original.x, event.clientY - original.y) > 4;
        var rect = button.parentElement!.getBoundingClientRect();
        button.style.left = 'clamp(43px,' + Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)) + '%,calc(100% - 43px))';
        button.style.top = 'clamp(45px,' + Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) + '%,calc(100% - 45px))';
      });
      async function place(event: PointerEvent) {
        if (!original) { return; }
        var before = original;
        original = null;
        button.classList.remove('dragging');
        if (button.hasPointerCapture(event.pointerId)) { button.releasePointerCapture(event.pointerId); }
        var target = document.elementsFromPoint(event.clientX, event.clientY).find(function (element) { return element.classList.contains('item-drop-zone'); });
        if (!target || !moved || event.type === 'pointercancel') { button.style.left = before.left; button.style.top = before.top; return; }
        var rect = target.getBoundingClientRect();
        try {
          await save('/api/items/' + button.dataset.placeItem, 'PATCH', { unit: (target as HTMLElement).dataset.dropUnit, layer: Number((target as HTMLElement).dataset.dropLayer), x: Math.max(.05, Math.min(.95, (event.clientX - rect.left) / rect.width)), y: Math.max(.1, Math.min(.85, (event.clientY - rect.top) / rect.height)) });
          renderPanel();
          layoutMessage('物品擺設已儲存。');
        } catch (error) { button.style.left = before.left; button.style.top = before.top; layoutMessage(messageOf(error), true); }
      }
      button.addEventListener('pointerup', place);
      button.addEventListener('pointercancel', place);
      button.addEventListener('keydown', async function (event) {
        var delta = ({ ArrowLeft: [-.03, 0], ArrowRight: [.03, 0], ArrowUp: [0, -.03], ArrowDown: [0, .03] } as Record<string, number[]>)[event.key];
        if (!delta || event.repeat || busy) { return; }
        event.preventDefault();
        var item = E.item(button.dataset.placeItem)!;
        busy = true;
        try {
          await save('/api/items/' + item.id, 'PATCH', { x: Math.max(.05, Math.min(.95, (item.x === undefined ? .5 : item.x) + delta[0])), y: Math.max(.1, Math.min(.85, (item.y === undefined ? .4 : item.y) + delta[1])) });
          renderPanel();
          var current = panel.querySelector<HTMLElement>('[data-place-item="' + item.id + '"]');
          if (current) { current.focus(); }
          layoutMessage('物品擺設已儲存。');
        } catch (error) { layoutMessage(messageOf(error), true); }
        finally { busy = false; }
      });
    });
  }
  function renderPanel() {
    var panel = element('panel-content');
    if (!panel) { return; }
    if (searchQuery.trim()) {
      var searchLayout = document.querySelector<HTMLElement>('.room-layout')!;
      if (searchLayout) { searchLayout.classList.add('has-selection'); }
      renderSearchResults(panel); return;
    }
    element('search-status').hidden = true;
    const u = E.unit(chosenUnit);
    var layout = document.querySelector<HTMLElement>('.room-layout')!;
    if (layout) { layout.classList.toggle('has-selection', !!u); }
    syncRoomControls();
    if (!u) {
      var units = data.units.filter(function (candidate) { return candidate.room === chosenRoom; });
      panel.innerHTML = '<div class="panel-header"><div><h2>' + escape(data.rooms.find(function (r) { return r.id === chosenRoom; })!.name) + '</h2><p>' + (units.length ? '選擇儲存處，查看物品與借用狀態。' : '這個房間尚未建立儲存處。') + '</p></div></div><div class="room-unit-list">' + units.map(function (candidate) { return '<button type="button" data-unit="' + candidate.code + '"><span class="num">' + candidate.code + '</span><span>' + escape(candidate.name || data.types[candidate.type]) + '</span></button>'; }).join('') + '</div><div class="shelf room-empty">' + (isAdmin() ? '<p class="muted">' + (units.length ? '可以新增儲存處或管理物品。' : '先為第一個儲存處命名，再加入物品；尺寸與位置可稍後調整。') + '</p><a class="button secondary" href="#/manage/' + chosenRoom + '">' + (units.length ? '新增儲存處與物品' : '新增第一個儲存處') + '</a>' : '<p class="muted">' + (units.length ? '目前沒有選取儲存處。' : '此房間尚未完成設定，請聯絡管理者。') + '</p>') + footer() + '</div>';
      panel.querySelectorAll<HTMLElement>('[data-unit]').forEach(function (button) { button.addEventListener('click', function () { chosenUnit = button.dataset.unit ?? null; chosenLayer = null; roomView!.select(chosenUnit, null); renderPanel(); }); });
      return;
    }
    var inventory = data.items.filter(function (i) { return i.unit === u.code; });
    var header = '<div class="panel-header"><span class="panel-tag">' + u.code + '</span><div><h2>' + escape(u.name || data.types[u.type]) + '</h2><p><span class="num">' + u.code + '</span> · ' + u.layers + ' 層 · ' + inventory.length + ' 種物品</p></div><a class="button" href="#/borrow/' + u.code + '">借用／預約</a></div>';
    var layers = u.layers ? Array.from({ length: u.layers }, function (_, index) { return index + 1; }) : [0];
    if (chosenLayer !== null && u.layers) { layers = [chosenLayer]; }
    panel.innerHTML = header + '<div class="shelf">' + layers.map(function (layer) {
      return (u.layers ? '<div class="shelf-heading"><button class="layer-button" type="button" data-layer="' + layer + '" aria-pressed="' + (chosenLayer === layer) + '">第 ' + layer + ' 層</button><span class="num">' + u.code + '-' + layer + '</span></div>' : '') + placementTray(inventory, u, layer) + inventory.filter(function (i) { return i.layer === layer; }).map(itemPanel).join('') + (!inventory.some(function (i) { return i.layer === layer; }) ? '<p class="panel-note">這一層目前沒有物品。</p>' : '');
    }).join('') + footer() + '</div>';
    panel.querySelectorAll<HTMLElement>('[data-layer]').forEach(function (button) {
      button.addEventListener('click', function () {
        chosenLayer = chosenLayer === Number(button.dataset.layer) ? null : Number(button.dataset.layer);
        roomView!.select(chosenUnit, chosenLayer);
        renderPanel();
        var focusedLayer = panel.querySelector<HTMLElement>('[data-layer="' + button.dataset.layer + '"]');
        if (focusedLayer) { focusedLayer.focus({ preventScroll: true }); }
      });
    });
    bindAssetEditors(panel);
    bindPlacement(panel);
    panel.querySelectorAll<HTMLElement>('[data-view-item]').forEach(function (button) {
      button.addEventListener('click', function () {
        var row = panel.querySelector<HTMLElement>('[data-inventory="' + button.dataset.viewItem + '"]');
        if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest' }); }
      });
    });
  }
  function renderSearchResults(panel: HTMLElement) {
    var results = E.searchItems(searchQuery);
    element('search-status').hidden = false;
    element('search-status').textContent = '所有房間 · 找到 ' + results.length + ' 種物品';
    panel.innerHTML = '<div class="search-results"><h2>搜尋結果</h2>' + (results.length ? '<ul class="search-list">' + results.map(function (inventory) {
      var u = E.unit(inventory.unit)!;
      var room = data.rooms.find(function (candidate) { return candidate.id === u.room; })!;
      return '<li><a class="search-result" href="#/room/' + u.room + '/item/' + inventory.id + '"><span class="search-result-name">' + escape(inventory.name) + '<span class="remaining num">' + E.remaining(inventory.id) + ' <small>/ ' + inventory.total + ' 剩餘</small></span></span><span class="asset-result">財產編號 <span class="num">' + (inventory.assetNumber ? escape(inventory.assetNumber) : '尚未填寫') + '</span></span><span class="search-location">' + escape(room.name) + ' · <span class="num">' + inventory.code + '</span></span><span class="search-open">查看位置與物品</span></a></li>';
    }).join('') + '</ul>' : '<div class="empty-state"><p>找不到符合的物品。</p><p>請試試其他名稱、財產編號或位置編號。</p></div>') + '</div>';
    panel.querySelectorAll<HTMLElement>('.search-result').forEach(function (link) {
      link.addEventListener('click', function (event) {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) { return; }
        event.preventDefault();
        go(link.getAttribute('href')!);
      });
    });
  }
  function syncSearchControls() {
    search.value = searchQuery;
    clear.hidden = !searchQuery;
  }
  function updateSearch() {
    searchQuery = search.value;
    clear.hidden = !searchQuery;
    if (element('panel-content')) {
      // 搜尋取代物品定位狀態，但不重建房間或搜尋欄位。
      if (searchQuery.trim() && location.hash.indexOf('/item/') >= 0) {
        history.replaceState(null, '', '#/room/' + chosenRoom);
      }
      renderPanel();
    } else if (searchQuery.trim() && location.hash !== '#/room/' + chosenRoom) {
      go('#/room/' + chosenRoom);
    }
  }
  function renderRoom(roomId: string, itemId?: string | null) {
    var room = data.rooms.find(function (r) { return r.id === roomId; });
    if (!room) { renderNotFound(); return; }
    if (chosenRoom !== roomId || !E.unit(chosenUnit) || E.unit(chosenUnit)?.room !== roomId) { chosenUnit = null; chosenLayer = null; }
    chosenRoom = roomId;
    var target = itemId ? E.item(itemId) : null;
    if (itemId && (!target || E.unit(target.unit)!.room !== roomId)) { renderNotFound(); return; }
    if (target) { chosenUnit = target.unit; chosenLayer = target.layer || null; searchQuery = ''; }
    syncSearchControls();
    editing = editing && isAdmin();
    app.innerHTML = '<div class="room-layout' + (editing ? ' is-editing' : '') + '"><section class="stage" id="stage" aria-label="' + escape(room.name) + '"><div class="title-block"><div>房間<b>' + escape(room.name) + '</b></div><div>今天<b class="num">' + E.state.today.replace(/-/g, '/') + '</b></div></div>' + (isAdmin() ? '<div class="manage-toolbar"><button type="button" class="button secondary" id="arrange-toggle" aria-pressed="' + editing + '">' + (editing ? '完成擺設' : '自由擺設') + '</button><a class="button secondary" href="#/manage/' + room.id + '">編輯房間與物品</a><div class="rotation-controls"' + (editing ? '' : ' hidden') + '><button type="button" class="button secondary" id="rotate-left" data-rotate="-1" disabled>左轉 90°</button><button type="button" class="button secondary" id="rotate-right" data-rotate="1" disabled>右轉 90°</button></div></div>' : '') + '<button type="button" class="button secondary overview-toggle" id="overview-toggle" aria-expanded="false" hidden>展開房間總覽</button><p class="arrangement-help" id="layout-help"' + (editing ? '' : ' hidden') + '>先選取家具，再拖曳移動或按鈕旋轉。鍵盤可用方向鍵、R 旋轉。櫃內箱子跟隨主櫃；物品每次放開後自動儲存。</p><p class="layout-status" id="layout-status" role="status" aria-live="polite"></p></section><aside class="info-panel" id="info-panel" aria-label="儲存處內容"><p class="search-summary muted" id="search-status" role="status" hidden></p><div id="panel-content"></div><p class="visually-hidden" id="asset-status" role="status"></p></aside></div>';
    roomView = new window.EZRoom(element('stage'), roomId, function (code, layer) {
      chosenUnit = code;
      chosenLayer = layer;
      searchQuery = '';
      syncSearchControls();
      renderPanel();
      element('info-panel').scrollTop = 0;
    }, { editing: editing, onMove: async function (code, transform) {
      layoutMessage('正在儲存擺設…');
      await save('/api/units/' + code, 'PATCH', transform);
      layoutMessage('擺設已儲存。');
    }, onError: function (message) { layoutMessage(message, true); } });
    var arrange = element<HTMLButtonElement>('arrange-toggle');
    if (arrange) { arrange.addEventListener('click', function () {
      editing = !editing;
      this.setAttribute('aria-pressed', String(editing));
      this.textContent = editing ? '完成擺設' : '自由擺設';
      element('layout-help').hidden = !editing;
      roomView!.setEditing(editing);
      document.querySelector<HTMLElement>('.room-layout')!.classList.toggle('is-editing', editing);
      document.querySelector<HTMLElement>('.rotation-controls')!.hidden = !editing;
      chosenLayer = null;
      renderPanel();
    }); }
    element('overview-toggle').addEventListener('click', function () {
      var expanded = document.querySelector<HTMLElement>('.room-layout')!.classList.toggle('overview-expanded');
      this.setAttribute('aria-expanded', String(expanded));
      this.textContent = expanded ? '收合房間總覽' : '展開房間總覽';
    });
    document.querySelectorAll<HTMLButtonElement>('[data-rotate]').forEach(function (button) {
      button.addEventListener('click', async function () {
        if (busy || !roomView || !editing) { return; }
        busy = true;
        var view = roomView;
        arrange!.disabled = true;
        syncRoomControls();
        try { await view.rotateSelected(Number(button.dataset.rotate) * Math.PI / 2); }
        catch (error) { layoutMessage(messageOf(error), true); }
        finally { busy = false; if (arrange!.isConnected) { arrange!.disabled = false; syncRoomControls(); } }
      });
    });
    roomView!.select(chosenUnit, chosenLayer, true);
    renderPanel();
    if (target) {
      var row = app.querySelector<HTMLElement>('[data-inventory="' + target.id + '"]');
      if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest' }); }
    }
  }
  function field(label: string, name: string, value: unknown, type?: string, attributes?: string) {
    return '<label class="field">' + label + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + escape(value) + '" ' + (attributes || '') + '></label>';
  }
  function storageOptions(value: string) {
    return data.units.map(function (unit) { var room = data.rooms.find(function (room) { return room.id === unit.room; })!; return '<option value="' + unit.code + '"' + (unit.code === value ? ' selected' : '') + '>' + escape(room.name + ' / ' + (unit.name || unit.code)) + '</option>'; }).join('');
  }
  var manageDrafts: Record<string, Draft> = {};
  var manageSelections: Record<string, { unit?: string; item?: string }> = {};
  var rememberManage = function () {};
  function renderManage(roomId?: string | null, unitCode?: string, itemId?: string) {
    if (!requireLogin()) { return; }
    if (!isAdmin()) { page('需要管理者權限', '只有管理者能編輯房間與擺設。', '', true); return; }
    rememberManage();
    var room = data.rooms.find(function (room) { return room.id === roomId; }) || data.rooms[0];
    var selection = manageSelections[room ? room.id : 'new'] || {};
    if (unitCode === undefined) { unitCode = selection.unit; }
    if (itemId === undefined) { itemId = selection.item; }
    manageSelections[room ? room.id : 'new'] = { unit: unitCode, item: itemId };
    var unit = E.unit(unitCode) || null;
    var item = E.item(itemId) || null;
    var roomUnits = room ? data.units.filter(function (unit) { return unit.room === room.id; }) : [];
    var itemUnit = item ? item.unit : unit ? unit.code : roomUnits[0] ? roomUnits[0].code : data.units[0] ? data.units[0].code : '';
    var itemLayer = item ? item.layer : E.unit(itemUnit)?.type === 'box' ? 0 : 1;
    var itemPosition = item || (itemUnit ? nextItemPosition(itemUnit, itemLayer) : { x: .5, y: .4 });
    var feedback = '<p class="manage-feedback" role="status" aria-live="polite" hidden></p>';
    page('管理空間', '建立房間、儲存處與物品。切換選項會保留草稿，重新整理前請先儲存。',
      '<p><a href="#/room/' + (room ? room.id : '') + '">回到 3D 房間</a></p><div class="manage-grid"><section><h2>房間</h2><label class="field">選擇房間<select id="manage-room-select">' + data.rooms.map(function (candidate) { return '<option value="' + candidate.id + '"' + (room && candidate.id === room.id ? ' selected' : '') + '>' + escape(candidate.name) + '</option>'; }).join('') + '</select></label>' + (room ? '<form id="rename-room-form" class="manage-form">' + field('房間名稱', 'name', room.name, 'text', 'required maxlength="80"') + '<button class="button" type="submit">儲存房間名稱</button>' + feedback + '</form>' : '') + '<form id="add-room-form" class="manage-form"><h3>新增房間</h3>' + field('新房間名稱', 'name', '', 'text', 'required maxlength="80" placeholder="例如：教具小屋"') + '<button class="button secondary" type="submit">新增房間</button>' + feedback + '</form></section>' +
      '<section><h2>儲存處與家具</h2><label class="field">選擇儲存處<select id="manage-unit-select"><option value="">新增儲存處</option>' + roomUnits.map(function (candidate) { return '<option value="' + candidate.code + '"' + (unit && candidate.code === unit.code ? ' selected' : '') + '>' + escape((candidate.name || data.types[candidate.type]) + ' · ' + candidate.code) + '</option>'; }).join('') + '</select></label>' + (room ? '<form id="unit-form" class="manage-form">' + field('名稱', 'name', unit ? unit.name || data.types[unit.type] : '', 'text', 'required maxlength="80" placeholder="例如：圖卡的家"') + '<label class="field">類型<select name="type"' + (unit ? ' disabled' : '') + '>' + Object.keys(data.types).map(function (type) { return '<option value="' + type + '"' + (unit && unit.type === type ? ' selected' : '') + '>' + data.types[type] + '</option>'; }).join('') + '</select></label>' + field('層數（箱子填 0）', 'layers', unit ? unit.layers : 3, 'number', 'required min="0" max="10" step="1"') + '<details class="manage-advanced"><summary>模型尺寸與位置</summary><h3>模型尺寸（房間單位）</h3><p class="muted">房間模型為 10 × 8 單位；尺寸與位置使用相同單位。</p><div class="manage-dimensions">' + field('寬度', 'w', unit ? unit.w : 1.5, 'number', 'required min="0.3" max="4" step="any"') + field('高度', 'h', unit ? unit.h : 2, 'number', 'required min="0.3" max="3.4" step="any"') + field('深度', 'd', unit ? unit.d : .8, 'number', 'required min="0.3" max="4" step="any"') + '</div><h3>模型位置（房間單位）</h3><p class="muted">也可在房間按「自由擺設」拖曳。X −5 至 5、Z −4 至 4，家具須完整位於房間內。</p><div class="manage-dimensions">' + field('X', 'x', unit ? unit.x : 0, 'number', 'required min="-5" max="5" step="any"') + field('Z', 'z', unit ? unit.z : 0, 'number', 'required min="-4" max="4" step="any"') + field('旋轉角度（度）', 'rotation', unit ? Math.round((unit.rotation || 0) * 180 / Math.PI) : 0, 'number', 'required step="1"') + '</div></details><button class="button" type="submit">' + (unit ? '儲存儲存處' : '新增儲存處') + '</button>' + feedback + '</form>' : '<p>請先新增房間。</p>') + '</section>' +
      '<section><h2>物品</h2><label class="field">選擇物品<select id="manage-item-select"><option value="">新增物品</option>' + data.items.filter(function (item) { return roomUnits.some(function (unit) { return unit.code === item.unit; }); }).map(function (candidate) { return '<option value="' + candidate.id + '"' + (item && candidate.id === item.id ? ' selected' : '') + '>' + escape(candidate.name) + '</option>'; }).join('') + '</select></label>' + (data.units.length ? '<form id="item-form" class="manage-form">' + field('物品名稱', 'name', item ? item.name : '', 'text', 'required maxlength="80"') + '<label class="field">放在哪個儲存處<select name="unit">' + storageOptions(itemUnit) + '</select></label>' + field('層（箱子填 0）', 'layer', itemLayer, 'number', 'required min="0" max="10" step="1"') + field('總件數', 'total', item ? item.total : 1, 'number', 'required min="1" max="100000" step="1"') + field('財產編號（可留空）', 'assetNumber', item ? item.assetNumber : '', 'text', 'maxlength="80"') + '<p><a href="#/numbering">查看財產編號規則參考</a></p><details class="manage-advanced"><summary>層內位置</summary><p class="muted">0 是左側／後方，1 是右側／前方；也可在自由擺設模式拖曳物品。</p><div class="manage-dimensions">' + field('層內水平位置（0–1）', 'x', itemPosition.x === undefined ? .5 : itemPosition.x, 'number', 'required min="0" max="1" step="any"') + field('層內前後位置（0–1）', 'y', itemPosition.y === undefined ? .4 : itemPosition.y, 'number', 'required min="0" max="1" step="any"') + '</div></details><button class="button" type="submit">' + (item ? '儲存物品' : '新增物品') + '</button>' + feedback + '</form>' : '<p>請先新增儲存處。</p>') + '</section></div><p id="form-error" class="form-error" role="alert" hidden></p><p id="manage-status" class="visually-hidden" role="status"></p>');
    var captures: ((event?: Event) => void)[] = [];
    function bindForm(id: string, key: string, callback: (values: Record<string, string | number>) => Promise<string | void>) {
      var form = element<NamedForm>(id);
      if (!form) { return; }
      var draft = manageDrafts[key] || (manageDrafts[key] = {});
      var details = form.querySelector('details');
      var status = form.querySelector<HTMLElement>('.manage-feedback')!;
      var viewHash = location.hash;
      var controls = Array.from(form.querySelectorAll<FieldControl>('input,select,button')).map(function (control) { return { element: control, disabled: control.disabled }; });
      if (draft.values) { Object.keys(draft.values).forEach(function (name) { if (form.elements[name]) { form.elements[name].value = draft.values![name]; } }); }
      if (details) { details.open = !!draft.open; }
      function capture(event?: Event) {
        if (!form.isConnected || manageDrafts[key] !== draft) { return; }
        if (event && (event.type === 'input' || event.type === 'change')) { draft.message = ''; draft.error = false; sync(); }
        draft.values = {};
        Array.from(form.elements as unknown as FieldControl[]).forEach(function (control) { if (control.name) { draft.values![control.name] = control.value; } });
        if (details) { draft.open = details.open; }
      }
      function sync() {
        status.textContent = draft.message || '';
        status.hidden = !draft.message;
        status.setAttribute('role', draft.error ? 'alert' : 'status');
        status.classList.toggle('form-error', !!draft.error);
        controls.forEach(function (control) { control.element.disabled = !!draft.pending || control.disabled; });
      }
      draft.update = function (saved) {
        if (!form.isConnected || location.hash !== viewHash) { return; }
        if (saved) { renderManage(room ? room.id : null, unit ? unit.code : '', item ? item.id : ''); }
        else { sync(); }
      };
      capture();
      sync();
      captures.push(capture);
      form.addEventListener('input', capture);
      form.addEventListener('change', capture);
      if (details) { details.addEventListener('toggle', capture); }
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (draft.pending) { return; }
        capture();
        var values = Object.fromEntries(new FormData(form)) as Record<string, string | number>;
        var hash = location.hash;
        draft.pending = true;
        draft.message = '儲存中…';
        draft.error = false;
        sync();
        try {
          var destination = await callback(values);
          manageDrafts[key] = { open: draft.open, message: demoUI ? '已儲存。' : '已儲存至資料庫。' };
          if (form.isConnected && location.hash === hash) {
            if (destination) { go(destination); }
            else { draft.update!(true); }
          } else { draft.update!(true); }
        } catch (error) { draft.message = messageOf(error); draft.error = true; draft.pending = false; draft.update!(false); }
        finally { draft.pending = false; if (form.isConnected) { sync(); } }
      });
    }
    rememberManage = function () { captures.forEach(function (capture) { capture(); }); };
    element<HTMLInputElement>('manage-room-select').addEventListener('change', function () { rememberManage(); go('#/manage/' + this.value); });
    element<HTMLInputElement>('manage-unit-select').addEventListener('change', function () { renderManage(room.id, this.value, item ? item.id : ''); });
    element<HTMLInputElement>('manage-item-select').addEventListener('change', function () { renderManage(room ? room.id : null, unit ? unit.code : '', this.value); });
    bindForm('rename-room-form', 'room:' + (room ? room.id : ''), async function (values) { await save('/api/rooms/' + room.id, 'PATCH', values); });
    bindForm('add-room-form', 'room:new', async function (values) { var previous = data.rooms.map(function (room) { return room.id; }); await save('/api/rooms', 'POST', values); var added = data.rooms.find(function (room) { return previous.indexOf(room.id) < 0; }); return '#/manage/' + (added ? added.id : room ? room.id : ''); });
    bindForm('unit-form', 'unit:' + (unit ? unit.code : 'new:' + (room ? room.id : '')), async function (values) { ['layers', 'w', 'h', 'd', 'x', 'z'].forEach(function (key) { values[key] = Number(values[key]); }); values.rotation = Number(values.rotation) * Math.PI / 180; values.room = room.id; if (unit) { values.type = unit.type; } if (values.type === 'box') { values.layers = 0; } await save('/api/units' + (unit ? '/' + unit.code : ''), unit ? 'PATCH' : 'POST', values); });
    bindForm('item-form', 'item:' + (item ? item.id : 'new:' + (room ? room.id : '')), async function (values) { ['layer', 'total', 'x', 'y'].forEach(function (key) { values[key] = Number(values[key]); }); if (E.unit(String(values.unit))!.type === 'box') { values.layer = 0; } await save('/api/items' + (item ? '/' + item.id : ''), item ? 'PATCH' : 'POST', values); });
  }
  function renderNumbering() {
    page('財產編號規則參考', '這是可採用的內部管理範例；已有機構財編時，請沿用原編號。', '<div class="numbering-guide"><h2>建議格式：單位－類別－取得年－流水號</h2><p class="num numbering-example">REH-TEACH-2026-0001</p><table><thead><tr><th>區段</th><th>範例</th><th>用途</th></tr></thead><tbody><tr><td>單位代碼</td><td>REH</td><td>使用固定的單位縮寫。</td></tr><tr><td>資產類別</td><td>TEACH</td><td>教具；其他類別可自訂，例如 EQUIP 設備、FURN 家具。</td></tr><tr><td>取得年</td><td>2026</td><td>以西元取得年度區分。</td></tr><tr><td>流水號</td><td>0001</td><td>同單位、類別、年度依序編號，避免重複使用。</td></tr></tbody></table><h2>編號與位置分開管理</h2><p>財產編號跟著物品，搬房間或換層後仍保留；位置編號則描述目前放在哪裡。QR Code 使用系統內部固定 ID，修改名稱、財產編號或擺設後仍可使用。</p><h2>多件相同物品</h2><p>目前一筆物品資料管理同類物品的總件數與一個財產編號。若每件都有獨立財編，請分別建立總件數為 1 的物品，例如 REH-TEACH-2026-0001、REH-TEACH-2026-0002。</p><p>類別與格式只是建議，財編欄位允許自行輸入或留空。系統會檢查非空白編號不得重複。</p></div>', true);
  }
  function resolveScan(kind: string, key: string) {
    var inventory = kind === 'item' ? E.item(key) : null;
    var u = kind === 'unit' ? E.unit(key) : inventory ? E.unit(inventory.unit)! : null;
    return u ? { unit: u, prechecked: inventory ? inventory.id : null, base: '#/scan/' + kind + '/' + key } : null;
  }
  function renderScan(context: ScanContext | null, action: string) {
    if (!context) { renderNotFound(); return; }
    if (!requireLogin()) { return; }
    if (action === 'borrow') { renderBorrow(context.unit, 'scan', context.prechecked); return; }
    if (action === 'pickup' || action === 'return') { renderOnSite(context, action); return; }
    var counts = { pickup: 0, return: 0 };
    E.state.records.forEach(function (r) {
      if (r.userId === E.state.user!.id && E.item(r.itemId)!.unit === context.unit.code) { counts.pickup += E.pending(r); counts.return += E.held(r); }
    });
    page(context.unit.code + ' ' + data.types[context.unit.type], '已掃描' + (context.prechecked ? '物品：' + E.item(context.prechecked)!.name : '儲存處') + '，請選擇這次的操作。', '<div class="scan-choices">' + [{ action: 'borrow', title: '借用／預約', hint: '選擇物品、件數與借還日期。' }, { action: 'pickup', title: '領取', hint: '確認領取自己的預約。' + (counts.pickup ? '你有 ' + counts.pickup + ' 件待領取' : '目前沒有') }, { action: 'return', title: '歸還', hint: '填寫這次歸還的件數。' + (counts.return ? '你有 ' + counts.return + ' 件尚未歸還' : '目前沒有') }].map(function (choice) { return '<button type="button" class="scan-choice" data-scan-action="' + choice.action + '">' + icon(choice.action) + '<span><strong>' + choice.title + '</strong><small>' + choice.hint + '</small></span></button>'; }).join('') + '</div>', true);
    app.querySelectorAll<HTMLElement>('[data-scan-action]').forEach(function (button) { button.addEventListener('click', function () { go(context.base + '/' + button.dataset.scanAction); }); });
  }
  function renderBorrow(u: Unit | undefined, source: string, prechecked: string | null) {
    if (!u) { renderNotFound(); return; }
    if (!requireLogin()) { return; }
    var inventory = data.items.filter(function (i) { return i.unit === u.code; });
    var user = E.state.user!;
    page('借用／預約', u.code + ' ' + data.types[u.type], '<form id="borrow-form"><div class="identity"><label class="field" for="borrow-name">姓名<input id="borrow-name" type="text" value="' + escape(user.name) + '" required autocomplete="name"></label><label class="field" for="borrow-email">Email<input id="borrow-email" type="email" value="' + escape(user.email) + '" readonly></label></div>' + inventory.map(function (i) {
      return '<div class="borrow-item" data-item="' + i.id + '"><div class="borrow-item-title"><label class="check-label" for="check-' + i.id + '"><input type="checkbox" id="check-' + i.id + '"' + (i.id === prechecked ? ' checked' : '') + '><strong>' + escape(i.name) + '</strong></label><span class="num muted">共 ' + i.total + ' 件</span></div><div class="borrow-fields"><label class="field" for="quantity-' + i.id + '">件數' + quantityInput('quantity-' + i.id, 1, i.total, i.name + '件數') + '</label><label class="field" for="start-' + i.id + '">借用日期<input id="start-' + i.id + '" type="date" min="' + E.state.today + '" value="' + E.state.today + '" required></label><label class="field" for="end-' + i.id + '">歸還日期<input id="end-' + i.id + '" type="date" min="' + E.state.today + '" required></label></div><p class="stock-note" id="stock-' + i.id + '" aria-live="polite"></p></div>';
    }).join('') + '<div class="form-footer"><p class="muted">' + (source === 'scan' ? '借用日期為今天，送出即算領取；未來日期則保留為預約。' : '網頁上的借用會保留為預約，請到現場掃碼領取。') + '</p><p id="form-error" class="form-error" hidden></p><button type="submit" class="button" id="borrow-submit" disabled>確認借用／預約</button></div></form>', true);
    var form = element<NamedForm>('borrow-form');
    function recalculate() {
      var valid = true;
      var checked = 0;
      inventory.forEach(function (i) {
        var row = form.querySelector<HTMLElement>('[data-item="' + i.id + '"]')!;
        var check = element<HTMLInputElement>('check-' + i.id);
        var fields = row.querySelector<HTMLElement>('.borrow-fields')!;
        var note = element('stock-' + i.id);
        fields.hidden = !check.checked;
        note.hidden = !check.checked;
        fields.querySelectorAll<FieldControl>('input,button').forEach(function (control) { control.disabled = !check.checked; });
        if (!check.checked) { return; }
        checked += 1;
        var start = element<HTMLInputElement>('start-' + i.id);
        var end = element<HTMLInputElement>('end-' + i.id);
        var quantity = element<HTMLInputElement>('quantity-' + i.id);
        end.min = start.value || E.state.today;
        var datesValid = E.validDates(start.value, end.value) && start.value >= E.state.today;
        var maximum = datesValid ? E.capacity(i.id, start.value, end.value) : i.total;
        quantity.max = String(maximum);
        var quantityValid = Number.isSafeInteger(Number(quantity.value)) && Number(quantity.value) >= 1 && Number(quantity.value) <= maximum;
        note.textContent = datesValid ? '這段期間最多可借 ' + maximum + ' 件' : end.value ? '歸還日期須在借用日期當天或之後。' : '請填寫歸還日期。';
        note.classList.toggle('error', datesValid && !quantityValid);
        syncStepper(quantity);
        if (!datesValid || !quantityValid) { valid = false; }
      });
      element<HTMLButtonElement>('borrow-submit').disabled = !checked || !valid || !element<HTMLInputElement>('borrow-name').value.trim();
    }
    bindSteppers(form, recalculate);
    recalculate();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      handle(function () {
        var selected = inventory.filter(function (i) { return element<HTMLInputElement>('check-' + i.id).checked; }).map(function (i) { return { itemId: i.id, quantity: Number(element<HTMLInputElement>('quantity-' + i.id).value), start: element<HTMLInputElement>('start-' + i.id).value, end: element<HTMLInputElement>('end-' + i.id).value }; });
        return E.makeBorrow(user.id, element<HTMLInputElement>('borrow-name').value, selected, source);
      });
    });
  }
  function renderOnSite(context: ScanContext, action: "pickup" | "return") {
    var records = E.state.records.filter(function (r) { return r.userId === E.state.user!.id && E.item(r.itemId)!.unit === context.unit.code && (action === 'pickup' ? E.pending(r) > 0 : E.held(r) > 0); });
    var isPickup = action === 'pickup';
    page(isPickup ? '領取預約' : '歸還物品', context.unit.code + ' ' + data.types[context.unit.type], (records.length ? '<div class="records">' + records.map(function (r) {
      var check = E.pickupAvailability(r);
      return '<article class="record"><div class="record-heading"><h2>' + escape(E.item(r.itemId)!.name) + '</h2><span class="num">' + (isPickup ? E.pending(r) + ' 件待領取' : E.held(r) + ' 件尚未歸還') + '</span></div><p class="record-details">' + dateRange(r, isPickup ? E.reservationStart(r) : r.start) + '</p>' + (isPickup ? '<p class="muted">' + (E.reservationStart(r) > E.state.today ? '庫存足夠即可提早領取；歸還日期維持不變。' : '最晚領取日：' + shortDate(E.pickupDeadline(r))) + '</p><div class="record-actions"><button class="button" data-pickup="' + r.id + '"' + (check.allowed ? '' : ' disabled') + '>領取 ' + E.pending(r) + ' 件</button></div>' + (check.allowed ? '' : '<p class="hint">' + check.reason + '</p>') : '<form data-return="' + r.id + '" class="return-controls"><label class="field" for="return-' + r.id + '">這次歸還件數' + quantityInput('return-' + r.id, 1, E.held(r), '歸還件數') + '</label><button type="submit" class="button">確認歸還</button></form>') + '</article>';
    }).join('') + '</div>' : '<p class="empty-state">這個儲存處目前沒有' + (isPickup ? '你的待領取預約。' : '你尚未歸還的物品。') + '</p>') + '<p id="form-error" class="form-error" hidden></p>', true);
    app.querySelectorAll<HTMLElement>('[data-pickup]').forEach(function (button) { button.addEventListener('click', function () { handle(function () { return E.pickup(button.dataset.pickup!, E.state.user!.id); }); }); });
    app.querySelectorAll<HTMLElement>('[data-return]').forEach(function (form) {
      var input = form.querySelector('input')!;
      function recalculate() { syncStepper(input); form.querySelector<HTMLButtonElement>('[type=submit]')!.disabled = !Number.isSafeInteger(Number(input.value)) || Number(input.value) < 1 || Number(input.value) > Number(input.max); }
      bindSteppers(form, recalculate);
      recalculate();
      form.addEventListener('submit', function (event) { event.preventDefault(); handle(function () { return E.returnQuantity(form.dataset.return!, Number(input.value), E.state.user!.id); }); });
    });
  }
  function renderMine() {
    if (!requireLogin()) { return; }
    var records = E.state.records.filter(function (r) { return r.userId === E.state.user!.id; }).sort(function (a, b) { return Number(E.held(b) > 0 || E.pending(b) > 0) - Number(E.held(a) > 0 || E.pending(a) > 0) || a.start.localeCompare(b.start); });
    page('我的借用', E.state.user!.name, (records.length ? '<div class="records">' + records.map(function (r) {
      var inventory = E.item(r.itemId)!;
      var active = E.held(r) > 0;
      var reserved = E.pending(r) > 0;
      var label = active ? '借用中 · ' + E.held(r) + ' 件' : reserved ? '預約 · ' + E.pending(r) + ' 件' : r.status === 'auto_cancelled' ? '已自動取消' : r.status === 'cancelled' ? '已取消' : '已歸還';
      var days = E.daysBetween(E.state.today, r.end);
      var applicant = E.state.requests.filter(function (req) { return req.loanId === r.id && req.status === 'pending'; }).map(function (req) {
        var waiting = req.affected.filter(function (answer) { return answer.response === null && !answer.noReplyNeeded; }).map(function (answer) { return E.record(answer.recordId)!.name; });
        return '<div class="extension-pending"><strong>延長申請中</strong><p>申請延長至 <span class="num">' + shortDate(req.newEnd) + '</span><br>尚待 ' + escape(waiting.join('、')) + ' 回覆。</p></div>';
      }).join('');
      var replies = E.state.requests.filter(function (req) { return req.status === 'pending' && req.affected.some(function (answer) { return answer.recordId === r.id && answer.response === null && !answer.noReplyNeeded; }); }).map(function (req) {
        return '<div class="extension-reply"><strong>待你回覆</strong><p>' + escape(E.record(req.loanId)!.name) + ' 申請延長至 <span class="num">' + shortDate(req.newEnd) + '</span>。</p><div class="record-actions"><button class="button" data-extension-reply="agree" data-request="' + req.id + '" data-reservation="' + r.id + '">同意</button><button class="button secondary" data-extension-reply="disagree" data-request="' + req.id + '" data-reservation="' + r.id + '">不同意</button></div></div>';
      }).join('');
      return '<article class="record"><div class="record-heading"><h2>' + escape(inventory.name) + '</h2><span>' + label + '</span></div><div class="record-details"><span class="num">' + inventory.unit + '</span>' + dateRange(r) + (active ? '<span class="' + (days < 0 ? 'late' : '') + '">距離歸還 <b class="num">' + days + '</b> 天</span>' : '') + (r.returned ? '<span>已歸還 <span class="num">' + r.returned + '</span> 件</span>' : '') + (r.cancelled ? '<span>已取消 <span class="num">' + r.cancelled + '</span> 件</span>' : '') + '</div>' + applicant + replies + (active ? '<p class="hint">請到現場掃碼歸還</p><div class="record-actions"><a class="button secondary" href="#/extend/' + r.id + '">申請延長</a>' + (E.futureReservations(r).length ? '<a class="button secondary" href="#/handover/' + r.id + '">直接轉交</a>' : '') + '</div>' : '') + (reserved ? '<p class="hint">請到現場掃碼領取' + (active ? '剩下的 ' + E.pending(r) + ' 件，原預約起日 ' + shortDate(E.reservationStart(r)) : '') + (r.keepUntilEnd ? '；預約保留至原訂歸還日 ' + shortDate(r.end) : '') + '</p>' + (E.canReschedule(r) ? '<div class="record-actions"><a class="button secondary" href="#/reschedule/' + r.id + '">修改預約</a></div>' : '') + '<div class="cancel-isolation"><button class="text-button" data-cancel="' + r.id + '">取消預約</button></div>' : '') + '</article>';
    }).join('') + '</div>' : '<p class="empty-state">這個帳號還沒有借用或預約。</p>') + '<p id="form-error" class="form-error" hidden></p>');
    app.querySelectorAll<HTMLElement>('[data-cancel]').forEach(function (button) { button.addEventListener('click', function () {
      var isolation = button.parentElement!;
      isolation.innerHTML = '<p>確定取消這筆預約？</p><div class="record-actions"><button type="button" class="button" data-confirm-cancel>確定取消</button><button type="button" class="button secondary" data-keep-reservation>保留預約</button></div>';
      var confirm = isolation.querySelector<HTMLElement>('[data-confirm-cancel]')!;
      confirm.addEventListener('click', function () { handle(function () { return E.cancelReservation(button.dataset.cancel!, E.state.user!.id); }); });
      isolation.querySelector<HTMLElement>('[data-keep-reservation]')!.addEventListener('click', function () { isolation.replaceChildren(button); button.focus(); });
      confirm.focus();
    }); });
    app.querySelectorAll<HTMLElement>('[data-extension-reply]').forEach(function (button) { button.addEventListener('click', function () { handle(function () { return E.respondExtension(button.dataset.request!, button.dataset.reservation!, button.dataset.extensionReply === 'agree'); }); }); });
  }
  function renderReschedule(recordId: string) {
    if (!requireLogin()) { return; }
    const r = E.record(recordId);
    if (!r || r.userId !== E.state.user!.id || !E.canReschedule(r)) { page('這筆預約無法修改', '只有尚未領取的預約可以修改。', '', true); return; }
    page('修改預約', E.item(r.itemId)!.name, (E.held(r) ? '<p class="muted">這次只修改未領取的 ' + E.pending(r) + ' 件；已收到的 ' + E.held(r) + ' 件仍借用至 <span class="num">' + shortDate(r.end) + '</span>。</p>' : '') + '<form id="reschedule-form"><div class="borrow-fields reschedule-fields"><label class="field" for="reschedule-quantity">件數' + quantityInput('reschedule-quantity', E.pending(r), E.item(r.itemId)!.total, '預約件數') + '</label><label class="field" for="reschedule-start">借用日期<input id="reschedule-start" type="date" value="' + E.reservationStart(r) + '" required></label><label class="field" for="reschedule-end">歸還日期<input id="reschedule-end" type="date" value="' + r.end + '" required></label></div><p id="reschedule-stock" class="stock-note" aria-live="polite"></p><div class="form-footer"><p id="form-error" class="form-error" hidden></p><button class="button" type="submit" id="reschedule-submit">儲存修改</button></div></form>', true);
    var form = element<NamedForm>('reschedule-form');
    var quantity = element<HTMLInputElement>('reschedule-quantity');
    var start = element<HTMLInputElement>('reschedule-start');
    var end = element<HTMLInputElement>('reschedule-end');
    function recalculate() {
      var valid = E.validDates(start.value, end.value) && end.value >= E.state.today;
      var maximum = valid ? E.rescheduleCapacity(r!, start.value, end.value) : 0;
      end.min = start.value > E.state.today ? start.value : E.state.today;
      quantity.max = String(maximum);
      var enough = Number.isSafeInteger(Number(quantity.value)) && Number(quantity.value) >= 1 && Number(quantity.value) <= maximum;
      var stock = element('reschedule-stock');
      stock.textContent = valid ? '這段期間最多可借 ' + maximum + ' 件' : '請填寫有效的借還日期，歸還日期須在今天或之後。';
      stock.classList.toggle('error', !valid || !enough);
      syncStepper(quantity);
      element<HTMLButtonElement>('reschedule-submit').disabled = !valid || !enough;
    }
    bindSteppers(form, recalculate);
    recalculate();
    form.addEventListener('submit', function (event) { event.preventDefault(); handle(function () { return E.rescheduleReservation(r.id, { start: start.value, end: end.value, quantity: Number(quantity.value) }, E.state.user!.id); }); });
  }
  function actionLoan(recordId: string, fromMail: boolean) {
    if (!fromMail && !requireLogin()) { return null; }
    const r = E.record(recordId);
    if (!r || (!fromMail && r.userId !== E.state.user!.id) || !E.held(r)) { page('這筆借用無法操作', '物品可能已歸還，或不屬於目前的帳號。', '', true); return null; }
    return r;
  }
  function renderExtend(recordId: string, fromMail: boolean) {
    const r = actionLoan(recordId, fromMail);
    if (!r) { return; }
    var pendingRequest = E.state.requests.some(function (req) { return req.loanId === r.id && req.status === 'pending'; });
    page('申請延長', E.item(r.itemId)!.name + ' · ' + r.name, '<p>目前歸還日期：<strong class="num">' + shortDate(r.end) + '</strong></p>' + (pendingRequest ? '<p class="muted">再次送出會取代尚未完成的延長申請，舊申請將作廢。</p>' : '') + '<form id="extend-form" class="extend-form"><label class="field" for="extend-days">延長天數<input id="extend-days" type="number" min="1" step="1" required></label><p id="new-due" class="muted" style="margin-top:14px">延長天數由你決定，沒有上限。</p><p id="form-error" class="form-error" hidden></p><button type="submit" class="button">送出延長申請</button></form>', true);
    var input = element<HTMLInputElement>('extend-days');
    input.addEventListener('input', function () {
      try { element('new-due').textContent = Number(input.value) > 0 ? '申請延長至 ' + shortDate(E.addDays(r.end, Number(input.value))) : '延長天數由你決定，沒有上限。'; }
      catch (error) { element('new-due').textContent = messageOf(error); }
    });
    element<NamedForm>('extend-form').addEventListener('submit', function (event) { event.preventDefault(); handle(function () { return E.extend(r.id, Number(input.value)); }); });
  }
  function renderHandover(recordId: string, fromMail: boolean) {
    const r = actionLoan(recordId, fromMail);
    if (!r) { return; }
    var recipients = E.futureReservations(r);
    page('直接轉交', E.item(r.itemId)!.name + ' · 手上有 ' + E.held(r) + ' 件', recipients.length ? '<form id="handover-form">' + recipients.map(function (reservation, index) {
      var maximum = Math.min(E.pending(reservation), E.held(r));
      return '<div class="handover-row" data-reservation="' + reservation.id + '"><label class="check-label" for="recipient-' + reservation.id + '"><input id="recipient-' + reservation.id + '" type="checkbox"' + (index === 0 ? ' checked' : '') + '><strong>' + escape(reservation.name) + '</strong></label><p class="recipient-details">' + escape((E.person(reservation.userId) || { email: undefined }).email || (demoUI ? '將建立站內通知' : '通知將寄給對方，不公開 Email')) + '<br>' + shortDate(E.reservationStart(reservation)) + ' – ' + shortDate(reservation.end) + ' · 預約 ' + E.pending(reservation) + ' 件</p><label class="field" for="handover-' + reservation.id + '">轉交件數' + quantityInput('handover-' + reservation.id, index === 0 ? maximum : 1, maximum, reservation.name + '的轉交件數') + '</label></div>';
    }).join('') + '<div class="form-footer"><p id="handover-total" class="muted" aria-live="polite"></p><p id="form-error" class="form-error" hidden></p><button class="button" type="submit" id="handover-submit">' + (demoUI ? '送出轉交通知' : '寄出轉交信') + '</button></div></form>' : '<p class="empty-state">目前沒有後續預約可轉交。</p>', true);
    if (!recipients.length) { return; }
    var form = element<NamedForm>('handover-form');
    function recalculate() {
      var selected = recipients.filter(function (reservation) { return element<HTMLInputElement>('recipient-' + reservation.id).checked; });
      var total = selected.reduce(function (sum, reservation) { return sum + Number(element<HTMLInputElement>('handover-' + reservation.id).value); }, 0);
      var valid = selected.length > 0 && total <= E.held(r!);
      recipients.forEach(function (reservation) {
        var input = element<HTMLInputElement>('handover-' + reservation.id);
        var checked = element<HTMLInputElement>('recipient-' + reservation.id).checked;
        var field = input.closest<HTMLElement>('.field')!;
        field.hidden = !checked;
        input.disabled = !checked;
        var others = total - (checked ? Number(input.value) : 0);
        input.max = String(Math.max(0, Math.min(E.pending(reservation), E.held(r!) - others)));
        syncStepper(input);
        if (checked && (!Number.isSafeInteger(Number(input.value)) || Number(input.value) < 1 || Number(input.value) > Number(input.max))) { valid = false; }
      });
      element('handover-total').textContent = '這次共轉交 ' + total + ' 件；最多可轉交手上的 ' + E.held(r!) + ' 件。';
      element<HTMLButtonElement>('handover-submit').disabled = !valid;
    }
    bindSteppers(form, recalculate);
    recalculate();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      handle(function () { return E.sendHandover(r.id, recipients.filter(function (reservation) { return element<HTMLInputElement>('recipient-' + reservation.id).checked; }).map(function (reservation) { return { recordId: reservation.id, quantity: Number(element<HTMLInputElement>('handover-' + reservation.id).value) }; })); });
    });
  }
  var labels: Record<string, string> = { extend: '一鍵延長', handover: '直接轉交', agree: '同意', disagree: '不同意', received: '確認收到', reject: '拒絕' };
  function renderMail(messageId?: string) {
    if (!requireLogin()) { return; }
    var messages = E.state.mails.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || Number(b.id.slice(4)) - Number(a.id.slice(4)); });
    var selected = messages.find(function (message) { return message.id === messageId; }) || messages[0];
    app.innerHTML = '<div class="page mail-page"><div class="page-header"><div><h1>我的通知</h1><p>' + (demoUI ? '這裡只顯示你的站內通知。' : '這裡只顯示寄給你的通知。設定 SMTP 後也會寄送至 Email。') + '</p></div></div><div class="mail-layout"><nav class="mail-list" aria-label="我的通知">' + messages.map(function (message) {
      return '<button type="button" class="mail-entry" data-mail="' + message.id + '" aria-current="' + (selected && selected.id === message.id) + '"><strong>' + escape(message.subject) + '</strong><small><span class="num">' + shortDate(message.date) + '</span></small></button>';
    }).join('') + '</nav><article class="mail-content">' + (selected ? '<h2>' + escape(selected.subject) + '</h2><div class="mail-body">' + selected.paragraphs.map(function (paragraph) { return '<p>' + escape(paragraph) + '</p>'; }).join('') + '</div>' + (selected.actions.length ? '<a class="button" href="#/mail-action/' + selected.token + '">查看並回覆</a>' : '') : '<p class="mail-empty">目前沒有通知。</p>') + '</article></div>' + footer() + '</div>';
    app.querySelectorAll<HTMLElement>('[data-mail]').forEach(function (button) { button.addEventListener('click', function () { go('#/mail/' + button.dataset.mail); }); });
  }
  async function renderMailAction(token: string) {
    page('載入通知', '', '<p role="status">正在確認這封通知…</p>', true);
    try {
      var value = await request<ReturnType<typeof mailView>>('/api/mail-actions/' + encodeURIComponent(token));
      if (location.hash.indexOf(token) < 0) { return; }
      var message = value.mail;
      page(message.subject, '確認內容後再送出回覆。通知連結只供收信人使用。', message.paragraphs.map(function (paragraph) { return '<p>' + escape(paragraph) + '</p>'; }).join('') + (message.used ? '<p class="muted">這封通知已處理。</p>' : '<form id="mail-action-form">' + (message.actions.indexOf('extend') >= 0 ? field('延長天數', 'days', 1, 'number', 'min="1" step="1"') : '') + (message.actions.indexOf('handover') >= 0 ? '<h2>轉交對象</h2>' + (message.candidates || []).map(function (candidate) { return '<label class="field">' + escape(candidate.name) + '（最多 ' + candidate.quantity + ' 件）<input type="number" data-mail-allocation="' + candidate.recordId + '" min="0" max="' + candidate.quantity + '" value="0" step="1"></label>'; }).join('') : '') + '<div class="record-actions">' + message.actions.map(function (action) { return '<button class="button' + (action === 'disagree' || action === 'reject' ? ' secondary' : '') + '" type="submit" name="action" value="' + action + '">' + labels[action] + '</button>'; }).join('') + '</div><p id="form-error" class="form-error" hidden></p></form>'), true);
      var form = element<NamedForm>('mail-action-form');
      if (form) { form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var body: { action: string; days?: number; allocations?: { recordId?: string; quantity: number }[] } = { action: (event.submitter as HTMLButtonElement).value };
        if (body.action === 'extend') { body.days = Number(form.elements.days.value); }
        if (body.action === 'handover') { body.allocations = Array.from(form.querySelectorAll<HTMLInputElement>('[data-mail-allocation]')).filter(function (input) { return Number(input.value) > 0; }).map(function (input) { return { recordId: input.dataset.mailAllocation, quantity: Number(input.value) }; }); }
        var buttons = Array.from(form.querySelectorAll('button'));
        buttons.forEach(function (button) { button.disabled = true; });
        try {
          var response = await request<{ result: Receipt }>('/api/mail-actions/' + encodeURIComponent(token), 'POST', body);
          applySnapshot(await request('/api/state'));
          E.state.receipts.push(response.result);
          showReceipt(response.result);
        } catch (error) { showError(messageOf(error)); buttons.forEach(function (button) { button.disabled = false; }); }
      }); }
    } catch (error) { page('這封信目前無法操作', '', '<p class="error" role="alert">' + escape(messageOf(error)) + '</p>', true); }
  }
  function renderResult(key: string) {
    var receipt = E.state.receipts.find(function (r) { return r.id === key; });
    if (!receipt) { renderNotFound(); return; }
    page(receipt.title, '', '<div class="result">' + receipt.paragraphs.map(function (paragraph) { return '<p>' + escape(paragraph) + '</p>'; }).join('') + '<a class="button" href="#/room/' + escape(receiptRooms[receipt.id] || '1') + '">回到房間</a></div>', true);
  }
  function renderQR() {
    var entries = data.units.map(function (u) { return { code: u.code, name: data.types[u.type], route: '#/scan/unit/' + u.code }; }).concat(data.items.map(function (i) { return { code: i.code, name: i.name, route: '#/scan/item/' + i.id }; }));
    app.innerHTML = '<div class="page"><div class="page-header"><div><h1>QR Code 列印</h1><p>所有儲存處與物品 · A4</p></div><button type="button" class="button print-button" id="print">列印</button></div><div class="qr-grid">' + entries.map(function (entry) { return '<article class="qr-label"><div class="qr-code"><img alt="' + escape(entry.code + ' ' + entry.name + ' QR Code') + '"></div><strong class="num">' + entry.code + '</strong><p>' + escape(entry.name) + '</p><a class="scan-link" href="' + entry.route + '">開啟借還頁面</a></article>'; }).join('') + '</div>' + footer() + '</div>';
    app.querySelectorAll<HTMLImageElement>('.qr-code img').forEach((image, index) => {
      const source = qrSource(entries[index].route);
      if (typeof source === 'string') image.src = source;
      else void source.then(value => { image.src = value; }).catch(error => showError(messageOf(error)));
    });
    element('print').addEventListener('click', function () { window.print(); });
  }
  function renderNotFound() { page('找不到這個頁面', '這個連結可能不完整，請重新選擇房間。', '<a class="button" href="#/room/' + (data.rooms[0] ? data.rooms[0].id : '') + '">回到房間</a>', true); }
  function route() {
    if (roomView) { roomView.destroy(); roomView = null; }
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var name = parts[0];
    document.querySelectorAll<HTMLElement>('[data-room]').forEach(function (a) { var active = name === 'room' && a.dataset.room === parts[1]; a.classList.toggle('active', active); if (active) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); } });
    document.title = 'EzStorage 教具借用';
    if (name === 'room') { renderRoom(parts[1], parts[2] === 'item' ? parts[3] : null); }
    else if (name === 'scan') { renderScan(resolveScan(parts[1], parts[2]), parts[3]); }
    else if (name === 'borrow') { renderBorrow(E.unit(parts[1]), 'web', null); }
    else if (name === 'mine') { renderMine(); }
    else if (name === 'reschedule') { renderReschedule(parts[1]); }
    else if (name === 'extend') { renderExtend(parts[1], false); }
    else if (name === 'handover') { renderHandover(parts[1], false); }
    else if (name === 'manage') { renderManage(parts[1]); }
    else if (name === 'numbering') { renderNumbering(); }
    else if (name === 'mail-action') { renderMailAction(parts[1]); }
    else if (name === 'mail') { renderMail(parts[1]); }
    else if (name === 'qr') { renderQR(); }
    else if (name === 'result') { renderResult(parts[1]); }
    else if (!name) {
      if (data.rooms.length) { go('#/room/' + data.rooms[0].id); }
      else { page('開始建立你的空間', '目前還沒有房間。登入管理者帳號後即可新增。', isAdmin() ? '<a class="button" href="#/manage">新增第一個房間</a>' : '<button class="button" id="empty-login">登入</button>', true); var login = element('empty-login'); if (login) { login.addEventListener('click', function () { chooseAccount(route); }); } }
    }
    else { renderNotFound(); }
    window.scrollTo(0, 0);
  }
  search.addEventListener('input', function (event) { if (!event.isComposing) { updateSearch(); } });
  search.addEventListener('compositionend', updateSearch);
  element<NamedForm>('inventory-search-form').addEventListener('submit', function (event) { event.preventDefault(); updateSearch(); });
  clear.addEventListener('click', function () { search.value = ''; updateSearch(); search.focus({ preventScroll: true }); });
  window.addEventListener('hashchange', route);
  route();
}());
