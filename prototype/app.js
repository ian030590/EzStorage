(function () {
  'use strict';
  var E = window.EZ;
  var data = E.data;
  var app = document.getElementById('app');
  var dialog = document.getElementById('account-dialog');
  var roomView = null;
  var chosenRoom = '1';
  var chosenUnit = 'A1';
  var chosenLayer = null;
  var afterLogin = null;
  function escape(value) { return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shortDate(value) { return value.slice(5).replace('-', '/'); }
  function dateRange(r, start) { return '<span class="num date-range">' + shortDate(start || r.start) + ' – ' + shortDate(r.end) + '</span>'; }
  function go(hash) { if (location.hash === hash) { route(); } else { location.hash = hash; } }
  function footer() { return '<div class="prototype-note"><span>原型：資料皆為虛構，重新整理後重設。</span><a href="#/mail">原型：信件預覽</a></div>'; }
  function page(title, subtitle, body, narrow) {
    app.innerHTML = '<div class="page' + (narrow ? ' narrow' : '') + '"><div class="page-header"><div><h1>' + escape(title) + '</h1>' + (subtitle ? '<p>' + escape(subtitle) + '</p>' : '') + '</div></div>' + body + footer() + '</div>';
  }
  function showReceipt(receipt) { go('#/result/' + receipt.id); }
  function showError(message, element) {
    var target = element || document.getElementById('form-error');
    if (target) { target.textContent = message; target.hidden = false; target.setAttribute('role', 'alert'); }
  }
  function handle(action) { try { showReceipt(action()); } catch (error) { showError(error.message); } }
  function icon(name) {
    var paths = { borrow: '<path d="M6 5h12v16H6zM9 5V2h6v3M9 10h6m-6 4h6m-6 4h4"/>', pickup: '<path d="M3 8h18v12H3zM3 8l4-5h10l4 5M12 3v11m-4-4 4 4 4-4"/>', return: '<path d="M3 8h18v12H3zM3 8l4-5h10l4 5M12 16V9m-4 4 4-4 4 4"/>', minus: '<path d="M4 12h16"/>', plus: '<path d="M4 12h16M12 4v16"/>' };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
  }
  function quantityInput(key, value, maximum, label) {
    return '<div class="quantity"><button type="button" data-step="-1" aria-label="減少' + escape(label) + '">' + icon('minus') + '</button><input id="' + key + '" type="number" min="1" max="' + maximum + '" step="1" value="' + value + '" required aria-label="' + escape(label) + '"><button type="button" data-step="1" aria-label="增加' + escape(label) + '">' + icon('plus') + '</button></div>';
  }
  function bindSteppers(container, recalculate) {
    container.querySelectorAll('[data-step]').forEach(function (button) {
      button.addEventListener('click', function () {
        var input = button.parentElement.querySelector('input');
        var maximum = Number(input.max);
        var next = Number(input.value) + Number(button.dataset.step);
        input.value = Math.max(maximum < 1 ? 0 : 1, Math.min(maximum, next));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    container.addEventListener('input', recalculate);
    container.addEventListener('change', recalculate);
  }
  function syncStepper(input) {
    var buttons = input.parentElement.querySelectorAll('button');
    buttons[0].disabled = Number(input.value) <= 1 || Number(input.max) < 1;
    buttons[1].disabled = Number(input.value) >= Number(input.max);
  }
  function chooseAccount(callback) {
    afterLogin = callback || route;
    if (!dialog.open) { dialog.showModal(); }
  }
  document.getElementById('accounts').innerHTML = ['lin', 'chen', 'wang'].map(function (key) {
    var p = E.person(key);
    return '<button type="button" class="account-choice" data-account="' + key + '"><strong>' + p.name + '</strong><span>' + p.email + '</span></button>';
  }).join('');
  document.getElementById('accounts').addEventListener('click', function (event) {
    var button = event.target.closest('[data-account]');
    if (!button) { return; }
    E.state.user = E.person(button.dataset.account);
    document.getElementById('account').textContent = E.state.user.name;
    dialog.close();
    var callback = afterLogin;
    afterLogin = null;
    if (callback) { callback(); }
  });
  dialog.addEventListener('close', function () { afterLogin = null; });
  document.getElementById('account').addEventListener('click', function () { chooseAccount(route); });
  function requireLogin() {
    if (E.state.user) { return true; }
    page('以 Google 帳號登入', '借用、預約、領取與歸還都需要登入。', '<button class="button" id="sign-in">以 Google 登入</button><p class="muted" style="margin-top:18px">原型：這裡會開啟虛構帳號選擇器。</p>', true);
    document.getElementById('sign-in').addEventListener('click', function () { chooseAccount(route); });
    chooseAccount(route);
    return false;
  }
  function itemPanel(inventory) {
    var records = E.state.records.filter(function (r) { return r.itemId === inventory.id; });
    var current = records.filter(function (r) { return E.held(r) > 0 || E.awaitingToday(r) > 0; });
    var next = records.filter(function (r) { return E.pending(r) > 0 && E.reservationStart(r) > E.state.today; }).sort(function (a, b) { return E.reservationStart(a).localeCompare(E.reservationStart(b)); });
    var out = E.outToday(inventory.id);
    function borrowerRow(r, quantity, start, waiting) {
      var days = E.daysBetween(E.state.today, r.end);
      return '<div class="borrower-row"><span>' + escape(r.name) + ' · <span class="num">' + quantity + '</span> 件' + (waiting ? '（待領取）' : '') + '</span>' + dateRange(r, start) + '<span class="num days' + (days < 0 ? ' late' : '') + '" aria-label="距離歸還 ' + days + ' 天">' + days + '</span></div>';
    }
    return '<article class="inventory-item"><div class="item-image" role="img" aria-label="' + escape(inventory.name + '，示範插圖；' + out + ' 件已領取或今天待領取') + '">' + inventory.image + '<div class="dark" style="height:' + Math.min(100, out / inventory.total * 100) + '%"></div></div><div class="item-info"><h3>' + escape(inventory.name) + '<span class="remaining num">' + E.remaining(inventory.id) + ' <small>/ ' + inventory.total + ' 剩餘</small></span></h3>' + (current.length ? current.map(function (r) {
      return (E.held(r) ? borrowerRow(r, E.held(r), r.start, false) : '') + (E.awaitingToday(r) ? borrowerRow(r, E.awaitingToday(r), E.reservationStart(r), true) : '');
    }).join('') : '<p class="empty">目前沒有人借用</p>') + (next.length ? '<p class="next-label">接下來</p>' + next.map(function (r) { return '<div class="next-row"><span>' + escape(r.name) + ' · <span class="num">' + E.pending(r) + '</span> 件</span>' + dateRange(r, E.reservationStart(r)) + '</div>'; }).join('') : '') + '</div></article>';
  }
  function renderPanel() {
    var panel = document.getElementById('info-panel');
    if (!panel) { return; }
    var u = E.unit(chosenUnit);
    if (!u) {
      panel.innerHTML = '<div class="panel-header"><div><h2>' + data.rooms.find(function (r) { return r.id === chosenRoom; }).name + '</h2><p>選擇儲存處，查看物品與借用狀態。</p></div></div><div class="room-unit-list">' + data.units.filter(function (candidate) { return candidate.room === chosenRoom; }).map(function (candidate) { return '<button type="button" data-unit="' + candidate.code + '"><span class="num">' + candidate.code + '</span><span>' + data.types[candidate.type] + '</span></button>'; }).join('') + '</div><div class="shelf">' + footer() + '</div>';
      panel.querySelectorAll('[data-unit]').forEach(function (button) { button.addEventListener('click', function () { chosenUnit = button.dataset.unit; chosenLayer = null; roomView.select(chosenUnit, null); renderPanel(); }); });
      return;
    }
    var inventory = data.items.filter(function (i) { return i.unit === u.code; });
    var header = '<div class="panel-header"><span class="panel-tag">' + u.code + '</span><div><h2>' + data.types[u.type] + '</h2><p><span class="num">' + u.code + '</span> · ' + u.layers + ' 層 · ' + inventory.length + ' 種物品</p></div><a class="button" href="#/borrow/' + u.code + '">借用／預約</a></div>';
    var layers = u.layers ? Array.from({ length: u.layers }, function (_, index) { return index + 1; }) : [0];
    if (chosenLayer !== null && u.layers) { layers = [chosenLayer]; }
    panel.innerHTML = header + '<div class="shelf">' + layers.map(function (layer) {
      return (u.layers ? '<div class="shelf-heading"><button class="layer-button" type="button" data-layer="' + layer + '" aria-pressed="' + (chosenLayer === layer) + '">第 ' + layer + ' 層</button><span class="num">' + u.code + '-' + layer + '</span></div>' : '') + inventory.filter(function (i) { return i.layer === layer; }).map(itemPanel).join('') + (u.layers && !inventory.some(function (i) { return i.layer === layer; }) ? '<p class="panel-note">這一層目前沒有物品。' : '') + (u.layers && !inventory.some(function (i) { return i.layer === layer; }) ? '</p>' : '');
    }).join('') + footer() + '</div>';
    panel.querySelectorAll('[data-layer]').forEach(function (button) {
      button.addEventListener('click', function () {
        chosenLayer = chosenLayer === Number(button.dataset.layer) ? null : Number(button.dataset.layer);
        roomView.select(chosenUnit, chosenLayer);
        renderPanel();
        var focusedLayer = panel.querySelector('[data-layer="' + button.dataset.layer + '"]');
        if (focusedLayer) { focusedLayer.focus({ preventScroll: true }); }
      });
    });
  }
  function renderRoom(roomId) {
    var room = data.rooms.find(function (r) { return r.id === roomId; });
    if (!room) { renderNotFound(); return; }
    if (chosenRoom !== roomId) { chosenUnit = data.units.find(function (u) { return u.room === roomId; }).code; chosenLayer = null; }
    chosenRoom = roomId;
    app.innerHTML = '<div class="room-layout"><section class="stage" id="stage" aria-label="' + room.name + '"><div class="title-block"><div>房間<b>' + room.name + '</b></div><div>今天<b class="num">' + E.state.today.replace(/-/g, '/') + '</b></div></div></section><aside class="info-panel" id="info-panel" aria-label="儲存處內容"></aside></div>';
    roomView = new window.EZRoom(document.getElementById('stage'), roomId, function (code, layer) { chosenUnit = code; chosenLayer = layer; renderPanel(); });
    roomView.select(chosenUnit, chosenLayer, true);
    renderPanel();
  }
  function resolveScan(kind, key) {
    var inventory = kind === 'item' ? E.item(key) : null;
    var u = kind === 'unit' ? E.unit(key) : inventory ? E.unit(inventory.unit) : null;
    return u ? { unit: u, prechecked: inventory ? inventory.id : null, base: '#/scan/' + kind + '/' + key } : null;
  }
  function renderScan(context, action) {
    if (!context) { renderNotFound(); return; }
    if (!requireLogin()) { return; }
    if (action === 'borrow') { renderBorrow(context.unit, 'scan', context.prechecked); return; }
    if (action === 'pickup' || action === 'return') { renderOnSite(context, action); return; }
    page(context.unit.code + ' ' + data.types[context.unit.type], '已掃描' + (context.prechecked ? '物品：' + E.item(context.prechecked).name : '儲存處') + '，請選擇這次的操作。', '<div class="scan-choices">' + [{ action: 'borrow', title: '借用／預約', hint: '選擇物品、件數與借還日期。' }, { action: 'pickup', title: '領取', hint: '確認領取自己的預約。' }, { action: 'return', title: '歸還', hint: '填寫這次歸還的件數。' }].map(function (choice) { return '<button type="button" class="scan-choice" data-scan-action="' + choice.action + '">' + icon(choice.action) + '<span><strong>' + choice.title + '</strong><small>' + choice.hint + '</small></span></button>'; }).join('') + '</div>', true);
    app.querySelectorAll('[data-scan-action]').forEach(function (button) { button.addEventListener('click', function () { go(context.base + '/' + button.dataset.scanAction); }); });
  }
  function renderBorrow(u, source, prechecked) {
    if (!u) { renderNotFound(); return; }
    if (!requireLogin()) { return; }
    var inventory = data.items.filter(function (i) { return i.unit === u.code; });
    var user = E.state.user;
    page('借用／預約', u.code + ' ' + data.types[u.type], '<form id="borrow-form"><div class="identity"><label class="field" for="borrow-name">姓名<input id="borrow-name" type="text" value="' + escape(user.name) + '" required autocomplete="name"></label><label class="field" for="borrow-email">Email<input id="borrow-email" type="email" value="' + escape(user.email) + '" readonly></label></div>' + inventory.map(function (i) {
      return '<div class="borrow-item" data-item="' + i.id + '"><div class="borrow-item-title"><label class="check-label" for="check-' + i.id + '"><input type="checkbox" id="check-' + i.id + '"' + (i.id === prechecked ? ' checked' : '') + '><strong>' + i.name + '</strong></label><span class="num muted">共 ' + i.total + ' 件</span></div><div class="borrow-fields"><label class="field" for="quantity-' + i.id + '">件數' + quantityInput('quantity-' + i.id, 1, i.total, i.name + '件數') + '</label><label class="field" for="start-' + i.id + '">借用日期<input id="start-' + i.id + '" type="date" min="' + E.state.today + '" value="' + E.state.today + '" required></label><label class="field" for="end-' + i.id + '">歸還日期<input id="end-' + i.id + '" type="date" min="' + E.state.today + '" required></label></div><p class="stock-note" id="stock-' + i.id + '" aria-live="polite"></p></div>';
    }).join('') + '<div class="form-footer"><p class="muted">' + (source === 'scan' ? '借用日期為今天，送出即算領取；未來日期則保留為預約。' : '網頁上的借用會保留為預約，請到現場掃碼領取。') + '</p><p id="form-error" class="form-error" hidden></p><button type="submit" class="button" id="borrow-submit" disabled>確認借用／預約</button></div></form>', true);
    var form = document.getElementById('borrow-form');
    function recalculate() {
      var valid = true;
      var checked = 0;
      inventory.forEach(function (i) {
        var row = form.querySelector('[data-item="' + i.id + '"]');
        var check = document.getElementById('check-' + i.id);
        var fields = row.querySelector('.borrow-fields');
        var note = document.getElementById('stock-' + i.id);
        fields.hidden = !check.checked;
        note.hidden = !check.checked;
        fields.querySelectorAll('input,button').forEach(function (control) { control.disabled = !check.checked; });
        if (!check.checked) { return; }
        checked += 1;
        var start = document.getElementById('start-' + i.id);
        var end = document.getElementById('end-' + i.id);
        var quantity = document.getElementById('quantity-' + i.id);
        end.min = start.value || E.state.today;
        var datesValid = E.validDates(start.value, end.value) && start.value >= E.state.today;
        var maximum = datesValid ? E.capacity(i.id, start.value, end.value) : i.total;
        quantity.max = maximum;
        var quantityValid = Number.isSafeInteger(Number(quantity.value)) && Number(quantity.value) >= 1 && Number(quantity.value) <= maximum;
        note.textContent = datesValid ? '這段期間最多可借 ' + maximum + ' 件' : end.value ? '歸還日期須在借用日期當天或之後。' : '請填寫歸還日期。';
        note.classList.toggle('error', datesValid && !quantityValid);
        syncStepper(quantity);
        if (!datesValid || !quantityValid) { valid = false; }
      });
      document.getElementById('borrow-submit').disabled = !checked || !valid || !document.getElementById('borrow-name').value.trim();
    }
    bindSteppers(form, recalculate);
    recalculate();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      handle(function () {
        var selected = inventory.filter(function (i) { return document.getElementById('check-' + i.id).checked; }).map(function (i) { return { itemId: i.id, quantity: Number(document.getElementById('quantity-' + i.id).value), start: document.getElementById('start-' + i.id).value, end: document.getElementById('end-' + i.id).value }; });
        return E.makeBorrow(user.id, document.getElementById('borrow-name').value, selected, source);
      });
    });
  }
  function renderOnSite(context, action) {
    var records = E.state.records.filter(function (r) { return r.userId === E.state.user.id && E.item(r.itemId).unit === context.unit.code && (action === 'pickup' ? E.pending(r) > 0 : E.held(r) > 0); });
    var isPickup = action === 'pickup';
    page(isPickup ? '領取預約' : '歸還物品', context.unit.code + ' ' + data.types[context.unit.type], (records.length ? '<div class="records">' + records.map(function (r) {
      var check = isPickup ? E.pickupAvailability(r) : null;
      return '<article class="record"><div class="record-heading"><h2>' + E.item(r.itemId).name + '</h2><span class="num">' + (isPickup ? E.pending(r) + ' 件待領取' : E.held(r) + ' 件尚未歸還') + '</span></div><p class="record-details">' + dateRange(r, isPickup ? E.reservationStart(r) : r.start) + '</p>' + (isPickup ? '<p class="muted">' + (E.reservationStart(r) > E.state.today ? '庫存足夠即可提早領取；歸還日期維持不變。' : '最晚領取日：' + shortDate(E.pickupDeadline(r))) + '</p><div class="record-actions"><button class="button" data-pickup="' + r.id + '"' + (check.allowed ? '' : ' disabled') + '>領取 ' + E.pending(r) + ' 件</button></div>' + (check.allowed ? '' : '<p class="hint">' + check.reason + '</p>') : '<form data-return="' + r.id + '" class="return-controls"><label class="field" for="return-' + r.id + '">這次歸還件數' + quantityInput('return-' + r.id, 1, E.held(r), '歸還件數') + '</label><button type="submit" class="button">確認歸還</button></form>') + '</article>';
    }).join('') + '</div>' : '<p class="empty-state">這個儲存處目前沒有' + (isPickup ? '你的待領取預約。' : '你尚未歸還的物品。') + '</p>') + '<p id="form-error" class="form-error" hidden></p>', true);
    app.querySelectorAll('[data-pickup]').forEach(function (button) { button.addEventListener('click', function () { handle(function () { return E.pickup(button.dataset.pickup, E.state.user.id); }); }); });
    app.querySelectorAll('[data-return]').forEach(function (form) {
      var input = form.querySelector('input');
      function recalculate() { syncStepper(input); form.querySelector('[type=submit]').disabled = !Number.isSafeInteger(Number(input.value)) || Number(input.value) < 1 || Number(input.value) > Number(input.max); }
      bindSteppers(form, recalculate);
      recalculate();
      form.addEventListener('submit', function (event) { event.preventDefault(); handle(function () { return E.returnQuantity(form.dataset.return, Number(input.value), E.state.user.id); }); });
    });
  }
  function renderMine() {
    if (!requireLogin()) { return; }
    var records = E.state.records.filter(function (r) { return r.userId === E.state.user.id; }).sort(function (a, b) { return Number(E.held(b) > 0 || E.pending(b) > 0) - Number(E.held(a) > 0 || E.pending(a) > 0) || a.start.localeCompare(b.start); });
    page('我的借用', E.state.user.name, (records.length ? '<div class="records">' + records.map(function (r) {
      var inventory = E.item(r.itemId);
      var active = E.held(r) > 0;
      var reserved = E.pending(r) > 0;
      var label = active ? '借用中 · ' + E.held(r) + ' 件' : reserved ? '預約 · ' + E.pending(r) + ' 件' : r.status === 'auto_cancelled' ? '已自動取消' : r.status === 'cancelled' ? '已取消' : '已歸還';
      var days = E.daysBetween(E.state.today, r.end);
      var applicant = E.state.requests.filter(function (req) { return req.loanId === r.id && req.status === 'pending'; }).map(function (req) {
        var waiting = req.affected.filter(function (answer) { return answer.response === null && !answer.noReplyNeeded; }).map(function (answer) { return E.record(answer.recordId).name; });
        return '<div class="extension-pending"><strong>延長申請中</strong><p>申請延長至 <span class="num">' + shortDate(req.newEnd) + '</span><br>尚待 ' + escape(waiting.join('、')) + ' 回覆。</p></div>';
      }).join('');
      var replies = E.state.requests.filter(function (req) { return req.status === 'pending' && req.affected.some(function (answer) { return answer.recordId === r.id && answer.response === null && !answer.noReplyNeeded; }); }).map(function (req) {
        return '<div class="extension-reply"><strong>待你回覆</strong><p>' + escape(E.record(req.loanId).name) + ' 申請延長至 <span class="num">' + shortDate(req.newEnd) + '</span>。</p><div class="record-actions"><button class="button" data-extension-reply="agree" data-request="' + req.id + '" data-reservation="' + r.id + '">同意</button><button class="button secondary" data-extension-reply="disagree" data-request="' + req.id + '" data-reservation="' + r.id + '">不同意</button></div></div>';
      }).join('');
      return '<article class="record"><div class="record-heading"><h2>' + inventory.name + '</h2><span>' + label + '</span></div><div class="record-details"><span class="num">' + inventory.unit + '</span>' + dateRange(r) + (active ? '<span class="' + (days < 0 ? 'late' : '') + '">距離歸還 <b class="num">' + days + '</b> 天</span>' : '') + (r.returned ? '<span>已歸還 <span class="num">' + r.returned + '</span> 件</span>' : '') + (r.cancelled ? '<span>已取消 <span class="num">' + r.cancelled + '</span> 件</span>' : '') + '</div>' + applicant + replies + (active ? '<p class="hint">請到現場掃碼歸還</p><div class="record-actions"><a class="button secondary" href="#/extend/' + r.id + '">申請延長</a>' + (E.futureReservations(r).length ? '<a class="button secondary" href="#/handover/' + r.id + '">直接轉交</a>' : '') + '</div>' : '') + (reserved ? '<p class="hint">請到現場掃碼領取' + (active ? '剩下的 ' + E.pending(r) + ' 件，原預約起日 ' + shortDate(E.reservationStart(r)) : '') + (r.keepUntilEnd ? '；預約保留至原訂歸還日 ' + shortDate(r.end) : '') + '</p>' + (E.canReschedule(r) ? '<div class="record-actions"><a class="button secondary" href="#/reschedule/' + r.id + '">修改預約</a></div>' : '') + '<div class="cancel-isolation"><button class="text-button" data-cancel="' + r.id + '">取消預約</button></div>' : '') + '</article>';
    }).join('') + '</div>' : '<p class="empty-state">這個帳號還沒有借用或預約。</p>') + '<p id="form-error" class="form-error" hidden></p>');
    app.querySelectorAll('[data-cancel]').forEach(function (button) { button.addEventListener('click', function () { handle(function () { return E.cancelReservation(button.dataset.cancel, E.state.user.id); }); }); });
    app.querySelectorAll('[data-extension-reply]').forEach(function (button) { button.addEventListener('click', function () { handle(function () { return E.respondExtension(button.dataset.request, button.dataset.reservation, button.dataset.extensionReply === 'agree'); }); }); });
  }
  function renderReschedule(recordId) {
    if (!requireLogin()) { return; }
    var r = E.record(recordId);
    if (!r || r.userId !== E.state.user.id || !E.canReschedule(r)) { page('這筆預約無法修改', '只有尚未領取的預約可以修改。', '', true); return; }
    page('修改預約', E.item(r.itemId).name, (E.held(r) ? '<p class="muted">這次只修改未領取的 ' + E.pending(r) + ' 件；已收到的 ' + E.held(r) + ' 件仍借用至 <span class="num">' + shortDate(r.end) + '</span>。</p>' : '') + '<form id="reschedule-form"><div class="borrow-fields reschedule-fields"><label class="field" for="reschedule-quantity">件數' + quantityInput('reschedule-quantity', E.pending(r), E.item(r.itemId).total, '預約件數') + '</label><label class="field" for="reschedule-start">借用日期<input id="reschedule-start" type="date" value="' + E.reservationStart(r) + '" required></label><label class="field" for="reschedule-end">歸還日期<input id="reschedule-end" type="date" value="' + r.end + '" required></label></div><p id="reschedule-stock" class="stock-note" aria-live="polite"></p><div class="form-footer"><p id="form-error" class="form-error" hidden></p><button class="button" type="submit" id="reschedule-submit">儲存修改</button></div></form>', true);
    var form = document.getElementById('reschedule-form');
    var quantity = document.getElementById('reschedule-quantity');
    var start = document.getElementById('reschedule-start');
    var end = document.getElementById('reschedule-end');
    function recalculate() {
      var valid = E.validDates(start.value, end.value) && end.value >= E.state.today;
      var maximum = valid ? E.rescheduleCapacity(r, start.value, end.value) : 0;
      end.min = start.value > E.state.today ? start.value : E.state.today;
      quantity.max = maximum;
      var enough = Number.isSafeInteger(Number(quantity.value)) && Number(quantity.value) >= 1 && Number(quantity.value) <= maximum;
      var stock = document.getElementById('reschedule-stock');
      stock.textContent = valid ? '這段期間最多可借 ' + maximum + ' 件' : '請填寫有效的借還日期，歸還日期須在今天或之後。';
      stock.classList.toggle('error', !valid || !enough);
      syncStepper(quantity);
      document.getElementById('reschedule-submit').disabled = !valid || !enough;
    }
    bindSteppers(form, recalculate);
    recalculate();
    form.addEventListener('submit', function (event) { event.preventDefault(); handle(function () { return E.rescheduleReservation(r.id, { start: start.value, end: end.value, quantity: Number(quantity.value) }, E.state.user.id); }); });
  }
  function actionLoan(recordId, fromMail) {
    if (!fromMail && !requireLogin()) { return null; }
    var r = E.record(recordId);
    if (!r || (!fromMail && r.userId !== E.state.user.id) || !E.held(r)) { page('這筆借用無法操作', '物品可能已歸還，或不屬於目前的帳號。', '', true); return null; }
    return r;
  }
  function renderExtend(recordId, fromMail) {
    var r = actionLoan(recordId, fromMail);
    if (!r) { return; }
    var pendingRequest = E.state.requests.some(function (req) { return req.loanId === r.id && req.status === 'pending'; });
    page('申請延長', E.item(r.itemId).name + ' · ' + r.name, '<p>目前歸還日期：<strong class="num">' + shortDate(r.end) + '</strong></p>' + (pendingRequest ? '<p class="muted">再次送出會取代尚未完成的延長申請，舊申請將作廢。</p>' : '') + '<form id="extend-form" class="extend-form"><label class="field" for="extend-days">延長天數<input id="extend-days" type="number" min="1" step="1" required></label><p id="new-due" class="muted" style="margin-top:14px">延長天數由你決定，沒有上限。</p><p id="form-error" class="form-error" hidden></p><button type="submit" class="button">送出延長申請</button></form>', true);
    var input = document.getElementById('extend-days');
    input.addEventListener('input', function () {
      try { document.getElementById('new-due').textContent = Number(input.value) > 0 ? '申請延長至 ' + shortDate(E.addDays(r.end, Number(input.value))) : '延長天數由你決定，沒有上限。'; }
      catch (error) { document.getElementById('new-due').textContent = error.message; }
    });
    document.getElementById('extend-form').addEventListener('submit', function (event) { event.preventDefault(); handle(function () { return E.extend(r.id, Number(input.value)); }); });
  }
  function renderHandover(recordId, fromMail) {
    var r = actionLoan(recordId, fromMail);
    if (!r) { return; }
    var recipients = E.futureReservations(r);
    page('直接轉交', E.item(r.itemId).name + ' · 手上有 ' + E.held(r) + ' 件', recipients.length ? '<form id="handover-form">' + recipients.map(function (reservation, index) {
      var maximum = Math.min(E.pending(reservation), E.held(r));
      return '<div class="handover-row" data-reservation="' + reservation.id + '"><label class="check-label" for="recipient-' + reservation.id + '"><input id="recipient-' + reservation.id + '" type="checkbox"' + (index === 0 ? ' checked' : '') + '><strong>' + escape(reservation.name) + '</strong></label><p class="recipient-details">' + escape(E.person(reservation.userId).email) + '<br>' + shortDate(E.reservationStart(reservation)) + ' – ' + shortDate(reservation.end) + ' · 預約 ' + E.pending(reservation) + ' 件</p><label class="field" for="handover-' + reservation.id + '">轉交件數' + quantityInput('handover-' + reservation.id, index === 0 ? maximum : 1, maximum, reservation.name + '的轉交件數') + '</label></div>';
    }).join('') + '<div class="form-footer"><p id="handover-total" class="muted" aria-live="polite"></p><p id="form-error" class="form-error" hidden></p><button class="button" type="submit" id="handover-submit">寄出轉交信</button></div></form>' : '<p class="empty-state">目前沒有後續預約可轉交。</p>', true);
    if (!recipients.length) { return; }
    var form = document.getElementById('handover-form');
    function recalculate() {
      var selected = recipients.filter(function (reservation) { return document.getElementById('recipient-' + reservation.id).checked; });
      var total = selected.reduce(function (sum, reservation) { return sum + Number(document.getElementById('handover-' + reservation.id).value); }, 0);
      var valid = selected.length > 0 && total <= E.held(r);
      recipients.forEach(function (reservation) {
        var input = document.getElementById('handover-' + reservation.id);
        var checked = document.getElementById('recipient-' + reservation.id).checked;
        var field = input.closest('.field');
        field.hidden = !checked;
        input.disabled = !checked;
        var others = total - (checked ? Number(input.value) : 0);
        input.max = Math.max(0, Math.min(E.pending(reservation), E.held(r) - others));
        syncStepper(input);
        if (checked && (!Number.isSafeInteger(Number(input.value)) || Number(input.value) < 1 || Number(input.value) > Number(input.max))) { valid = false; }
      });
      document.getElementById('handover-total').textContent = '這次共轉交 ' + total + ' 件；最多可轉交手上的 ' + E.held(r) + ' 件。';
      document.getElementById('handover-submit').disabled = !valid;
    }
    bindSteppers(form, recalculate);
    recalculate();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      handle(function () { return E.sendHandover(r.id, recipients.filter(function (reservation) { return document.getElementById('recipient-' + reservation.id).checked; }).map(function (reservation) { return { recordId: reservation.id, quantity: Number(document.getElementById('handover-' + reservation.id).value) }; })); });
    });
  }
  var labels = { extend: '一鍵延長', handover: '直接轉交', agree: '同意', disagree: '不同意', received: '確認收到', reject: '拒絕' };
  function renderMail(messageId) {
    var messages = E.state.mails.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || Number(b.id.slice(4)) - Number(a.id.slice(4)); });
    var selected = messages.find(function (message) { return message.id === messageId; }) || messages[0];
    app.innerHTML = '<div class="page mail-page"><div class="page-header"><div><h1>原型：信件預覽</h1><p>信件文字為草稿。這裡模擬各位同事的收件匣，不會寄出真實 Email。</p></div></div><div class="mail-layout"><nav class="mail-list" aria-label="示範信件">' + messages.map(function (message) {
      return '<button type="button" class="mail-entry" data-mail="' + message.id + '" aria-current="' + (selected && selected.id === message.id) + '"><strong>' + escape(message.subject) + '</strong><small>收件人：' + E.person(message.to).name + ' · <span class="num">' + shortDate(message.date) + '</span></small></button>';
    }).join('') + '</nav><article class="mail-content">' + (selected ? '<dl class="mail-metadata"><dt>收件人</dt><dd>' + escape(E.person(selected.to).name + ' <' + E.person(selected.to).email + '>') + '</dd><dt>主旨</dt><dd><strong>' + escape(selected.subject) + '</strong></dd></dl><div class="mail-body">' + selected.paragraphs.map(function (paragraph) { return '<p>' + escape(paragraph) + '</p>'; }).join('') + '</div><div class="mail-buttons">' + selected.actions.map(function (action) { return '<a class="button' + (action === 'disagree' || action === 'reject' ? ' secondary' : '') + '" href="#/mail/action/' + selected.token + '/' + action + '">' + labels[action] + '</a>'; }).join('') + '</div><p class="mail-draft">信件文字為草稿。信中的動作不需登入；本原型以各封信獨立的連結模擬。</p>' : '<p class="mail-empty">目前沒有示範信件。</p>') + '</article></div>' + footer() + '</div>';
    app.querySelectorAll('[data-mail]').forEach(function (button) { button.addEventListener('click', function () { go('#/mail/' + button.dataset.mail); }); });
  }
  function renderMailAction(token, action) {
    var message = E.state.mails.find(function (entry) { return entry.token === token; });
    if (!message || message.actions.indexOf(action) < 0) { renderNotFound(); return; }
    if (action === 'extend') { renderExtend(message.refs.loanId, true); return; }
    if (action === 'handover') { renderHandover(message.refs.loanId, true); return; }
    try {
      var receipt;
      if (action === 'agree' || action === 'disagree') { receipt = E.respondExtension(message.refs.requestId, message.refs.reservationId, action === 'agree'); }
      else { receipt = E.respondHandover(message.refs.handoverId, action === 'received'); }
      history.replaceState(null, '', '#/result/' + receipt.id);
      renderResult(receipt.id);
    } catch (error) { page('這封信目前無法操作', '', '<p class="error" role="alert">' + escape(error.message) + '</p>', true); }
  }
  function renderResult(key) {
    var receipt = E.state.receipts.find(function (r) { return r.id === key; });
    if (!receipt) { renderNotFound(); return; }
    page(receipt.title, '', '<div class="result">' + receipt.paragraphs.map(function (paragraph) { return '<p>' + escape(paragraph) + '</p>'; }).join('') + '</div>', true);
  }
  function renderQR() {
    var entries = data.units.map(function (u) { return { code: u.code, name: data.types[u.type], route: '#/scan/unit/' + u.code }; }).concat(data.items.map(function (i) { return { code: i.code, name: i.name, route: '#/scan/item/' + i.id }; }));
    app.innerHTML = '<div class="page"><div class="page-header"><div><h1>QR Code 列印</h1><p>所有儲存處與物品 · A4</p></div><button type="button" class="button print-button" id="print">列印</button></div><div class="qr-grid">' + entries.map(function (entry, index) { return '<article class="qr-label"><div class="qr-code" id="qr-' + index + '"></div><strong class="num">' + entry.code + '</strong><p>' + entry.name + '</p><a class="scan-link" href="' + entry.route + '">原型：模擬掃描</a></article>'; }).join('') + '</div>' + footer() + '</div>';
    entries.forEach(function (entry, index) {
      var element = document.getElementById('qr-' + index);
      if (!window.qrcode) { element.textContent = 'QR 程式未載入，請連網後重新整理。'; return; }
      var code = window.qrcode(0, 'M');
      code.addData(location.href.split('#')[0] + entry.route);
      code.make();
      element.innerHTML = code.createSvgTag({ cellSize: 3, margin: 4, scalable: true });
      element.querySelector('svg').setAttribute('role', 'img');
      element.querySelector('svg').setAttribute('aria-label', entry.code + ' ' + entry.name + ' QR Code');
    });
    document.getElementById('print').addEventListener('click', function () { window.print(); });
  }
  function renderNotFound() { page('找不到這個頁面', '這個連結可能不完整，或記憶體中的示範資料已隨重新整理重設。', '<a class="button" href="#/room/1">回到一樓 治療教室</a>', true); }
  function route() {
    if (roomView) { roomView.destroy(); roomView = null; }
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var name = parts[0];
    document.querySelectorAll('[data-room]').forEach(function (a) { var active = name === 'room' && a.dataset.room === parts[1]; a.classList.toggle('active', active); if (active) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); } });
    document.title = 'EzStorage 教具借用';
    if (name === 'room') { renderRoom(parts[1]); }
    else if (name === 'scan') { renderScan(resolveScan(parts[1], parts[2]), parts[3]); }
    else if (name === 'borrow') { renderBorrow(E.unit(parts[1]), 'web', null); }
    else if (name === 'mine') { renderMine(); }
    else if (name === 'reschedule') { renderReschedule(parts[1]); }
    else if (name === 'extend') { renderExtend(parts[1], false); }
    else if (name === 'handover') { renderHandover(parts[1], false); }
    else if (name === 'mail' && parts[1] === 'action') { renderMailAction(parts[2], parts[3]); }
    else if (name === 'mail') { renderMail(parts[1]); }
    else if (name === 'qr') { renderQR(); }
    else if (name === 'result') { renderResult(parts[1]); }
    else if (!name) { history.replaceState(null, '', '#/room/1'); renderRoom('1'); document.querySelector('[data-room="1"]').classList.add('active'); }
    else { renderNotFound(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
}());
