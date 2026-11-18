(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.createEngine = factory;
}(typeof window === "undefined" ? globalThis : window, function (data, persistedState) {
  'use strict';
  var state = persistedState || { today: data.today, user: null, records: data.records || [], events: [], requests: [], handovers: [], mails: [], receipts: [] };
  function validationError(message) { return Object.assign(new Error(message), { status: 400 }); }
  function id(prefix) { return prefix + "-" + globalThis.crypto.randomUUID(); }
  function dateNumber(value) { return Date.parse(value + 'T00:00:00Z'); }
  function addDays(value, days) {
    var result = new Date(dateNumber(value) + Number(days) * 86400000);
    if (!Number.isFinite(result.getTime()) || result.getUTCFullYear() > 9999 || result.getUTCFullYear() < 1) { throw validationError('日期超出瀏覽器可表示的範圍，請重新輸入天數。'); }
    return result.toISOString().slice(0, 10);
  }
  function daysBetween(start, end) { return Math.round((dateNumber(end) - dateNumber(start)) / 86400000); }
  function displayDates(value) { return String(value).replace(/\b\d{4}-(\d{2})-(\d{2})\b/g, '$1/$2'); }
  function person(key) { return data.people.find(function (p) { return p.id === key; }); }
  function item(key) { return data.items.find(function (p) { return p.id === key; }); }
  function unit(code) { return data.units.find(function (p) { return p.code === code; }); }
  function updateAssetNumber(itemId, value) {
    var inventory = item(itemId);
    if (!inventory) { throw validationError('找不到這個物品，請重新選擇。'); }
    inventory.assetNumber = String(value === undefined || value === null ? '' : value).trim();
    return inventory;
  }
  function searchItems(query) {
    var term = String(query || '').trim().toLocaleLowerCase();
    if (!term) { return []; }
    return data.items.filter(function (inventory) {
      var storage = unit(inventory.unit);
      var room = data.rooms.find(function (candidate) { return candidate.id === storage.room; });
      return [inventory.name, inventory.assetNumber, inventory.code, storage.code, room.name].some(function (value) {
        return String(value || '').toLocaleLowerCase().indexOf(term) >= 0;
      });
    });
  }
  function record(key) { return state.records.find(function (r) { return r.id === key; }); }
  function held(r) { return r.picked - r.returned; }
  function pending(r) { return Math.max(0, r.quantity - r.picked - r.cancelled - (r.rescheduledQuantity || 0)); }
  function reservationStart(r) { return r.reservationStart || r.start; }
  function pickupDeadline(r) { return r.keepUntilEnd ? r.end : addDays(reservationStart(r), 1); }
  function awaitingToday(r) { return reservationStart(r) <= state.today && state.today <= r.end && state.today <= pickupDeadline(r) ? pending(r) : 0; }
  function canReschedule(r) { return pending(r) > 0; }
  function event(type, ref, details, date) {
    state.events.push({ id: id('ev'), type: type, ref: ref, date: date || state.today, details: details || {} });
  }
  function updateStatus(r) {
    r.status = held(r) > 0 ? 'active' : pending(r) > 0 ? 'reserved' : r.picked > 0 ? 'returned' : r.autoCancelled ? 'auto_cancelled' : 'cancelled';
  }
  function validDates(start, end) {
    return /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && Number.isFinite(dateNumber(start)) && Number.isFinite(dateNumber(end)) && new Date(dateNumber(start)).toISOString().slice(0, 10) === start && new Date(dateNumber(end)).toISOString().slice(0, 10) === end && start <= end;
  }
  function segments(itemId, excluded, override) {
    var excludedIds = excluded || [];
    var result = [];
    state.records.forEach(function (r) {
      if (r.itemId !== itemId || excludedIds.indexOf(r.id) >= 0) { return; }
      var due = override && override.id === r.id ? override.end : r.end;
      if (held(r) > 0) { result.push({ start: r.start, end: due < state.today ? state.today : due, quantity: held(r), recordId: r.id }); }
      if (pending(r) > 0 && reservationStart(r) <= r.end && !(override && override.excludePendingId === r.id)) { result.push({ start: reservationStart(r), end: r.end, quantity: pending(r), recordId: r.id }); }
    });
    return result;
  }
  function capacity(itemId, start, end, excluded, override) {
    if (!validDates(start, end)) { return 0; }
    var inventory = item(itemId);
    if (!inventory) { return 0; }
    var commitments = segments(itemId, excluded, override).filter(function (s) { return s.start <= end && s.end >= start; });
    var points = [start];
    commitments.forEach(function (s) {
      if (s.start >= start && s.start <= end) { points.push(s.start); }
      if (s.end >= start && s.end < end) { points.push(addDays(s.end, 1)); }
    });
    var peak = 0;
    points.forEach(function (day) {
      var count = commitments.reduce(function (sum, s) { return sum + (s.start <= day && s.end >= day ? s.quantity : 0); }, 0);
      peak = Math.max(peak, count);
    });
    return Math.max(0, inventory.total - peak);
  }
  function outToday(itemId) {
    return state.records.filter(function (r) { return r.itemId === itemId; }).reduce(function (sum, r) {
      return sum + held(r) + awaitingToday(r);
    }, 0);
  }
  function remaining(itemId) { return item(itemId).total - outToday(itemId); }
  function rescheduleCapacity(r, start, end) { return capacity(r.itemId, start, end, [], { excludePendingId: r.id }); }
  function futureReservations(r) {
    return state.records.filter(function (candidate) {
      return candidate.itemId === r.itemId && candidate.userId !== r.userId && pending(candidate) > 0 && reservationStart(candidate) > r.start && candidate.end >= state.today;
    }).sort(function (a, b) { return reservationStart(a).localeCompare(reservationStart(b)) || a.id.localeCompare(b.id); });
  }
  function sendMail(type, to, subject, paragraphs, actions, refs, date) {
    var bytes = new Uint32Array(3);
    globalThis.crypto.getRandomValues(bytes);
    var message = { id: id('mail'), type: type, to: to, subject: displayDates(subject), paragraphs: paragraphs.map(displayDates), actions: actions || [], refs: refs || {}, date: date || state.today, tokenExpires: Date.now() + 14 * 86400000 };
    message.token = message.id + '-' + Array.from(bytes).map(function (n) { return n.toString(36); }).join('');
    state.mails.push(message);
    event('email', message.id, { type: type, to: to }, message.date);
    return message;
  }
  function contact(userId) { var p = person(userId); return p.name + '（' + p.email + '）'; }
  function acknowledge(title, paragraphs) {
    var receipt = { id: id('result'), title: displayDates(title), paragraphs: paragraphs.map(displayDates) };
    state.receipts.push(receipt);
    return receipt;
  }
  function makeBorrow(userId, name, selections, source) {
    if (!person(userId) || !name.trim() || !selections.length) { throw validationError('請填寫姓名，並勾選要借用的物品。'); }
    var seen = [];
    var unitCode = null;
    selections.forEach(function (selection) {
      var inventory = item(selection.itemId);
      if (!inventory || seen.indexOf(selection.itemId) >= 0 || (unitCode && unitCode !== inventory.unit)) { throw validationError('請選擇同一儲存處的物品。'); }
      unitCode = inventory.unit;
      seen.push(selection.itemId);
      if (!validDates(selection.start, selection.end) || selection.start < state.today) { throw validationError('借用日期須從今天起，歸還日期須在借用日期當天或之後。'); }
      var maximum = capacity(selection.itemId, selection.start, selection.end);
      if (!Number.isSafeInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > maximum) { throw validationError(inventory.name + '：這段期間最多可借 ' + maximum + ' 件'); }
    });
    selections.forEach(function (selection) {
      var immediate = source === 'scan' && selection.start === state.today;
      var r = { id: id('r'), itemId: selection.itemId, userId: userId, name: name.trim(), quantity: selection.quantity, start: selection.start, reservationStart: selection.start, end: selection.end, picked: immediate ? selection.quantity : 0, returned: 0, cancelled: 0, status: immediate ? 'active' : 'reserved' };
      state.records.push(r);
      event('reserve', r.id, { quantity: r.quantity, start: r.start, end: r.end, source: source, name: r.name });
      if (immediate) { event('pickup', r.id, { quantity: r.quantity, source: 'scan' }); }
    });
    return acknowledge('借用／預約已完成', selections.map(function (s) {
      return item(s.itemId).name + ' · ' + s.quantity + ' 件，' + s.start + ' 至 ' + s.end + (source === 'scan' && s.start === state.today ? '，已領取。' : '，請到現場掃碼領取。');
    }));
  }
  function pickupAvailability(r) {
    if (!pending(r) || r.end < state.today || state.today > pickupDeadline(r)) { return { allowed: false, reason: '已超過可領取期間。' }; }
    var maximum = capacity(r.itemId, state.today, r.end, [r.id]) - held(r);
    var enough = maximum >= pending(r);
    return { allowed: enough, reason: enough ? '' : '目前庫存不足，無法提早領取。' };
  }
  function pickup(recordId, userId) {
    var r = record(recordId);
    if (!r || r.userId !== userId) { throw validationError('找不到這個帳號的預約。'); }
    var check = pickupAvailability(r);
    if (!check.allowed) { throw validationError(check.reason); }
    var quantity = pending(r);
    var previousStart = r.start;
    if (!r.reservationStart) { r.reservationStart = previousStart; }
    if (!r.picked && r.start !== state.today) { r.start = state.today; }
    r.picked += quantity;
    updateStatus(r);
    event('pickup', r.id, { quantity: quantity, previousStart: previousStart, start: state.today, source: 'scan' });
    return acknowledge('已確認領取', [item(r.itemId).name + ' · ' + quantity + ' 件，這次領取的部分從 ' + state.today + ' 開始借用，歸還日期仍為 ' + r.end + '。']);
  }
  function cancelRequestsIfReturned(r) {
    if (held(r) > 0) { return; }
    state.requests.filter(function (req) { return req.loanId === r.id && req.status === 'pending'; }).forEach(function (req) {
      req.status = 'cancelled';
      event('extension_cancelled', req.id, { reason: 'returned' });
    });
  }
  function returnQuantity(recordId, quantity, userId) {
    var r = record(recordId);
    if (!r || r.userId !== userId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > held(r)) { throw validationError('請輸入尚未歸還範圍內的件數。'); }
    r.returned += quantity;
    updateStatus(r);
    event('return', r.id, { quantity: quantity, source: 'scan', remaining: held(r) });
    cancelRequestsIfReturned(r);
    return acknowledge('歸還已記錄', [item(r.itemId).name + ' 已歸還 ' + quantity + ' 件，尚有 ' + held(r) + ' 件在你手上。']);
  }
  function cancelReservation(recordId, userId) {
    var r = record(recordId);
    if (!r || r.userId !== userId || !pending(r)) { throw validationError('這筆預約已領取或已取消。'); }
    var quantity = pending(r);
    r.cancelled += quantity;
    updateStatus(r);
    event('cancel', r.id, { quantity: quantity });
    refreshRequestsForItem(r.itemId);
    return acknowledge('預約已取消', [item(r.itemId).name + ' · ' + quantity + ' 件的預約已取消，原紀錄保留。']);
  }
  function rescheduleReservation(recordId, values, userId) {
    var r = record(recordId);
    if (!r || r.userId !== userId || !canReschedule(r)) { throw validationError('只有尚未領取的預約可以修改。'); }
    if (!validDates(values.start, values.end) || values.end < state.today) { throw validationError('請填寫有效的借還日期，歸還日期須在今天或之後。'); }
    var maximum = rescheduleCapacity(r, values.start, values.end);
    if (!Number.isSafeInteger(values.quantity) || values.quantity < 1 || values.quantity > maximum) { throw validationError('這段期間最多可借 ' + maximum + ' 件'); }
    var before = { start: reservationStart(r), end: r.end, quantity: pending(r) };
    var original = r;
    if (r.picked > 0) {
      r.rescheduledQuantity = (r.rescheduledQuantity || 0) + before.quantity;
      updateStatus(r);
      r = { id: id('r'), itemId: original.itemId, userId: original.userId, name: original.name, quantity: values.quantity, start: values.start, reservationStart: values.start, end: values.end, picked: 0, returned: 0, cancelled: 0, status: 'reserved', rescheduledFrom: original.id };
      state.records.push(r);
      event('reservation_split', original.id, { reservationId: r.id, quantity: before.quantity, receivedStart: original.start, receivedEnd: original.end, held: held(original) });
      event('reserve', r.id, { quantity: values.quantity, start: values.start, end: values.end, source: 'reschedule', from: original.id });
    }
    r.start = values.start;
    r.reservationStart = values.start;
    r.end = values.end;
    r.quantity = values.quantity + r.cancelled;
    r.keepUntilEnd = false;
    updateStatus(r);
    event('reschedule', original.id, { reservationId: r.id, before: before, after: { start: r.start, end: r.end, quantity: pending(r) } });
    refreshRequestsForItem(r.itemId);
    var details = item(r.itemId).name + ' · ' + pending(r) + ' 件，借用日期 ' + reservationStart(r) + '，歸還日期 ' + r.end + '。';
    sendMail('reschedule', r.userId, '改期確認信｜' + item(r.itemId).name, [r.name + '，你的預約已修改。', details, '請到現場掃碼領取。原預約與這次修改都保留紀錄。'], [], { reservationId: r.id });
    return acknowledge('預約已修改', [details, '改期通知已建立，可在「我的通知」查看。']);
  }
  function affectedReservations(r, newEnd) {
    var extensionStart = addDays(r.end, 1);
    if (extensionStart > newEnd) { return []; }
    return state.records.filter(function (candidate) {
      if (candidate.id === r.id || candidate.itemId !== r.itemId || !pending(candidate)) { return false; }
      var start = reservationStart(candidate) > extensionStart ? reservationStart(candidate) : extensionStart;
      var end = candidate.end < newEnd ? candidate.end : newEnd;
      return start <= end && capacity(r.itemId, start, end, [candidate.id], { id: r.id, end: newEnd }) < pending(candidate);
    });
  }
  function applyExtension(req) {
    var r = record(req.loanId);
    var previousEnd = r.end;
    r.end = req.newEnd;
    req.status = 'applied';
    req.affected.forEach(function (answer) {
      var reservation = record(answer.recordId);
      if (!pending(reservation) || answer.noReplyNeeded || answer.response !== true) { return; }
      var originalStart = reservationStart(reservation);
      if (req.newEnd >= reservation.end) {
        reservation.keepUntilEnd = true;
        event('reservation_retained', reservation.id, { start: originalStart, end: reservation.end, requestId: req.id });
      } else {
        reservation.reservationStart = addDays(req.newEnd, 1);
        if (!reservation.picked) { reservation.start = reservation.reservationStart; }
        reservation.keepUntilEnd = false;
        event('reservation_shift', reservation.id, { previousStart: originalStart, start: reservation.reservationStart, end: reservation.end, requestId: req.id });
      }
    });
    event('extension_applied', req.id, { loanId: r.id, previousEnd: previousEnd, end: r.end });
    if (req.affected.length) { sendMail('extension_applied', r.userId, '延長已生效｜' + item(r.itemId).name, [r.name + '，需要回覆的預約者都已同意，或因改期／取消而不再受影響。', item(r.itemId).name + ' 的歸還日期已改為 ' + r.end + '。', '同意且仍受影響的預約，借用日起延至新歸還日的隔天，歸還日不變；若新歸還日已到或超過其歸還日，則保留原日期至原訂歸還日，或由預約者自行改期。'], [], { loanId: r.id }); }
  }
  function requestComplete(req) { return req.affected.every(function (answer) { return answer.response === true || answer.noReplyNeeded; }); }
  function sendExtensionMail(req, reservation) {
    var r = record(req.loanId);
    var outcome = req.newEnd >= reservation.end ? '新歸還日已到或超過你的歸還日。同意後仍保留原預約日期至 ' + reservation.end + '，也可以自行改期；若到期仍未領取，將自動結束預約並寄信通知。' : '生效時，你的借用日期改為 ' + addDays(req.newEnd, 1) + '，歸還日期不變。';
    sendMail('extension_request', reservation.userId, '延長申請｜' + item(r.itemId).name, [reservation.name + '，' + r.name + ' 希望延長借用 ' + item(r.itemId).name + ' 至 ' + req.newEnd + '。', '你的預約為 ' + reservationStart(reservation) + ' 至 ' + reservation.end + '，共 ' + pending(reservation) + ' 件。這段期間的庫存會不足，需要你的同意。', '所有仍受影響的人都同意後才會生效。' + outcome], ['agree', 'disagree'], { requestId: req.id, reservationId: reservation.id });
  }
  function refreshRequestsForItem(itemId) {
    state.requests.filter(function (req) { return req.status === 'pending' && record(req.loanId).itemId === itemId; }).forEach(function (req) {
      var r = record(req.loanId);
      if (!held(r)) { cancelRequestsIfReturned(r); return; }
      var affected = affectedReservations(r, req.newEnd);
      req.affected.forEach(function (answer) {
        var stillAffected = affected.some(function (reservation) { return reservation.id === answer.recordId; });
        var wasWaived = !!answer.noReplyNeeded;
        answer.noReplyNeeded = !stillAffected;
        if (wasWaived !== answer.noReplyNeeded) {
          event('extension_affected_update', req.id, { reservationId: answer.recordId, noReplyNeeded: answer.noReplyNeeded });
          if (stillAffected && answer.response === null) { sendExtensionMail(req, record(answer.recordId)); }
        }
      });
      affected.forEach(function (reservation) {
        if (req.affected.some(function (answer) { return answer.recordId === reservation.id; })) { return; }
        req.affected.push({ recordId: reservation.id, response: null, noReplyNeeded: false });
        event('extension_affected_update', req.id, { reservationId: reservation.id, noReplyNeeded: false });
        sendExtensionMail(req, reservation);
      });
      if (requestComplete(req)) { applyExtension(req); }
    });
  }
  function extend(recordId, days) {
    var r = record(recordId);
    if (!r || held(r) < 1) { throw validationError('這筆借用已經歸還，無法延長。'); }
    if (!Number.isSafeInteger(days) || days < 1) { throw validationError('請輸入正整數的延長天數。'); }
    var newEnd = addDays(r.end, days);
    var affected = affectedReservations(r, newEnd);
    var req = { id: id('req'), loanId: r.id, oldEnd: r.end, newEnd: newEnd, days: days, status: 'pending', affected: affected.map(function (candidate) { return { recordId: candidate.id, response: null }; }) };
    state.requests.filter(function (previous) { return previous.loanId === r.id && previous.status === 'pending'; }).forEach(function (previous) {
      previous.status = 'void';
      event('extension_voided', previous.id, { replacementId: req.id });
    });
    state.requests.push(req);
    event('extension_request', req.id, { loanId: r.id, days: days, newEnd: newEnd, affected: affected.map(function (candidate) { return candidate.id; }) });
    if (!affected.length) {
      applyExtension(req);
      return acknowledge('延長已立即生效', [item(r.itemId).name + ' 的新歸還日期為 ' + newEnd + '，沒有影響其他人的預約。']);
    }
    affected.forEach(function (reservation) {
      sendExtensionMail(req, reservation);
    });
    return acknowledge('延長申請已建立', ['已建立給 ' + affected.map(function (reservation) { return reservation.name; }).join('、') + ' 的站內通知；設定 SMTP 後也會排程寄信。所有受影響的預約者都同意後才會生效。', '目前有效的歸還日期仍為 ' + r.end + '。']);
  }
  function respondExtension(requestId, reservationId, agree) {
    var req = state.requests.find(function (entry) { return entry.id === requestId; });
    if (!req || req.status !== 'pending') { return acknowledge('這封信已處理', ['這次延長申請已結束，這個按鈕不會重複變更紀錄。']); }
    var answer = req.affected.find(function (entry) { return entry.recordId === reservationId; });
    if (!answer || answer.response !== null || answer.noReplyNeeded) { return acknowledge('這個回覆已處理', ['你已回覆，或已不再受影響，這個按鈕不會重複變更紀錄。']); }
    var r = record(req.loanId);
    if (!held(r)) { cancelRequestsIfReturned(r); return acknowledge('延長申請已取消', ['物品已歸還，不再需要回覆。']); }
    answer.response = agree;
    event(agree ? 'extension_agree' : 'extension_disagree', req.id, { reservationId: reservationId });
    var reservation = record(reservationId);
    if (!agree) {
      req.status = 'denied';
      sendMail('communication', r.userId, '請兩人溝通｜' + item(r.itemId).name, [reservation.name + ' 未同意延長。歸還日期仍為 ' + r.end + '。', '請聯絡 ' + contact(reservation.userId) + '，一起協調借用時間。'], [], { requestId: req.id });
      sendMail('communication', reservation.userId, '請兩人溝通｜' + item(r.itemId).name, ['你已選擇不同意延長，原歸還日期維持不變。', '請聯絡 ' + contact(r.userId) + '，一起協調借用時間。'], [], { requestId: req.id });
      return acknowledge('已回覆不同意', ['延長不生效。系統已建立給雙方的通知，附有對方的姓名與 Email，請兩人溝通。']);
    }
    if (requestComplete(req)) {
      applyExtension(req);
      return acknowledge('已同意，延長已生效', [reservation.keepUntilEnd ? '新歸還日已到或超過你的歸還日；你的預約維持 ' + reservationStart(reservation) + ' 至 ' + reservation.end + '，可自行改期。若到期仍未領取，將自動結束並建立通知。' : '你的借用日期改為 ' + reservationStart(reservation) + '，歸還日期仍為 ' + reservation.end + '。', '所有需要的回覆都已完成，已建立借用人的通知。']);
    }
    return acknowledge('已記錄同意', ['你的回覆已記錄，仍需其他受影響的預約者同意。生效前日期維持不變。']);
  }
  function sendHandover(recordId, allocations) {
    var r = record(recordId);
    if (!r || !held(r) || !allocations.length) { throw validationError('請選擇轉交對象與件數。'); }
    var allowed = futureReservations(r);
    var total = 0;
    var seen = [];
    allocations.forEach(function (allocation) {
      var reservation = allowed.find(function (candidate) { return candidate.id === allocation.recordId; });
      if (!reservation || seen.indexOf(reservation.id) >= 0 || !Number.isSafeInteger(allocation.quantity) || allocation.quantity < 1 || allocation.quantity > Math.min(pending(reservation), held(r))) { throw validationError('轉交件數須在對方預約件數與你持有的件數範圍內。'); }
      seen.push(reservation.id);
      total += allocation.quantity;
    });
    if (total > held(r)) { throw validationError('轉交總件數不能超過你手上的 ' + held(r) + ' 件。'); }
    allocations.forEach(function (allocation) {
      var reservation = record(allocation.recordId);
      var handover = { id: id('handover'), loanId: r.id, reservationId: reservation.id, quantity: allocation.quantity, status: 'pending' };
      state.handovers.push(handover);
      event('handover_sent', handover.id, { loanId: r.id, reservationId: reservation.id, quantity: allocation.quantity });
      sendMail('handover', reservation.userId, '轉交確認｜' + item(r.itemId).name, [reservation.name + '，' + r.name + ' 要直接轉交 ' + item(r.itemId).name + ' · ' + allocation.quantity + ' 件給你。', '實際收到後，請按「確認收到」，就會同時記錄你的領取與對方的歸還。你的歸還日期仍為 ' + reservation.end + '。', '未轉交的件數仍須到現場掃碼領取，沿用原預約借用日 ' + reservationStart(reservation) + ' 的領取期限，不會改用確認收到日計算。'], ['received', 'reject'], { handoverId: handover.id });
    });
    return acknowledge('轉交通知已建立', ['已建立給 ' + allocations.map(function (allocation) { return record(allocation.recordId).name + ' · ' + allocation.quantity + ' 件'; }).join('、') + ' 的站內通知；設定 SMTP 後也會排程寄信。', '對方確認收到前，物品仍算在原借用人身上，原有提醒與預約取消規則繼續適用。']);
  }
  function respondHandover(handoverId, receive) {
    var handover = state.handovers.find(function (entry) { return entry.id === handoverId; });
    if (!handover || handover.status !== 'pending') { return acknowledge('這封信已處理', ['這次轉交已有結果，不會重複領取或歸還。']); }
    var r = record(handover.loanId);
    var reservation = record(handover.reservationId);
    if (!receive) {
      handover.status = 'rejected';
      event('handover_rejected', handover.id, { quantity: handover.quantity });
      sendMail('handover_rejected', r.userId, '轉交被拒絕｜' + item(r.itemId).name, [reservation.name + ' 拒絕這次 ' + handover.quantity + ' 件的轉交。', '物品仍算在你手上，請依原訂日期 ' + r.end + ' 歸還。'], [], { handoverId: handover.id });
      return acknowledge('已拒絕轉交', ['已建立給原借用人的通知，物品仍算在對方身上。']);
    }
    if (held(r) < handover.quantity || pending(reservation) < handover.quantity || reservation.end < state.today) { throw validationError('目前可轉交或可領取的件數已變更，這封信無法完成確認。'); }
    var previousStart = reservation.start;
    if (!reservation.reservationStart) { reservation.reservationStart = previousStart; }
    r.returned += handover.quantity;
    if (!reservation.picked) { reservation.start = state.today; }
    reservation.picked += handover.quantity;
    handover.status = 'received';
    updateStatus(r);
    updateStatus(reservation);
    event('handover_received', handover.id, { quantity: handover.quantity });
    event('return', r.id, { quantity: handover.quantity, source: 'handover' });
    event('pickup', reservation.id, { quantity: handover.quantity, source: 'handover', previousStart: previousStart, start: state.today });
    cancelRequestsIfReturned(r);
    return acknowledge('已確認收到', [item(r.itemId).name + ' · ' + handover.quantity + ' 件已算作你領取、原借用人歸還。', '這次收到的部分從 ' + state.today + ' 開始借用，歸還日期仍為 ' + reservation.end + '。', pending(reservation) ? '還有 ' + pending(reservation) + ' 件要到現場掃碼領取，沿用原預約借用日 ' + reservationStart(reservation) + '，最晚領取日為 ' + pickupDeadline(reservation) + '。' : '這筆預約已全數領取。']);
  }
  function daily(day) {
    state.today = day;
    var changedItems = [];
    state.records.forEach(function (r) {
      if (pending(r) && day > pickupDeadline(r)) {
        var quantity = pending(r);
        r.cancelled += quantity;
        r.autoCancelled = true;
        updateStatus(r);
        event('auto_cancel', r.id, { quantity: quantity, reason: r.keepUntilEnd ? 'extension_past_end' : 'pickup_deadline' });
        changedItems.push(r.itemId);
        var explanation = r.keepUntilEnd ? '因前一位延長後的新歸還日已到或超過你的原訂歸還日，預約保留原日期至 ' + r.end + '。截至該日仍未領取、也未自行改期，已在今日早上的排程自動結束這些件數。' : '原預約借用日期為 ' + reservationStart(r) + '，至隔天仍未領取，已在今日早上的排程自動取消這些件數。';
        sendMail('auto_cancel', r.userId, '預約已自動取消｜' + item(r.itemId).name, [r.name + '，你的 ' + item(r.itemId).name + ' 預約有 ' + quantity + ' 件未領取。', explanation + '原紀錄保留。'], [], { loanId: r.id });
      }
    });
    changedItems.filter(function (value, index, values) { return values.indexOf(value) === index; }).forEach(refreshRequestsForItem);
    state.records.forEach(function (r) {
      if (held(r) > 0 && r.end <= day && !state.mails.some(function (message) { return message.type === 'reminder' && message.refs.loanId === r.id && message.date === day; })) {
        var next = futureReservations(r)[0];
        var overdue = daysBetween(r.end, day);
        var paragraphs = [r.name + '，你借用的 ' + item(r.itemId).name + ' · ' + held(r) + ' 件，歸還日期為 ' + r.end + (overdue ? '，目前已逾期 ' + overdue + ' 天。' : '，今天到期。'), '請到現場掃碼歸還，也可以按下方按鈕延長借用。'];
        if (next) { paragraphs.push('下一位是 ' + contact(next.userId) + '，預約 ' + reservationStart(next) + ' 至 ' + next.end + ' · ' + pending(next) + ' 件。可以聯絡對方直接轉交。'); }
        sendMail('reminder', r.userId, (overdue ? '逾期提醒' : '到期提醒') + '｜' + item(r.itemId).name, paragraphs, next ? ['extend', 'handover'] : ['extend'], { loanId: r.id });
      }
    });
    state.requests.filter(function (req) { return req.status === 'pending'; }).forEach(function (req) {
      var r = record(req.loanId);
      if (!held(r)) { cancelRequestsIfReturned(r); return; }
      var unanswered = req.affected.filter(function (entry) { return entry.response === null && !entry.noReplyNeeded; });
      if (!unanswered.length || state.mails.some(function (message) { return message.type === 'nudge_borrower' && message.refs.requestId === req.id && message.date === day; })) { return; }
      sendMail('nudge_borrower', r.userId, '延長回覆提醒｜' + item(r.itemId).name, ['還有 ' + unanswered.map(function (entry) { return contact(record(entry.recordId).userId); }).join('、') + ' 未回覆你的延長申請，請主動聯絡。', '目前歸還日期仍為 ' + r.end + '。'], [], { requestId: req.id });
      unanswered.forEach(function (entry) {
        var reservation = record(entry.recordId);
        sendMail('nudge_holder', reservation.userId, '請回覆延長申請｜' + item(r.itemId).name, [reservation.name + '，' + r.name + ' 申請延長至 ' + req.newEnd + '，仍在等候你的回覆。', '請選擇同意或不同意。所有人同意才會生效，原訂歸還日期不變。'], ['agree', 'disagree'], { requestId: req.id, reservationId: reservation.id });
      });
    });
  }
  return { data: data, state: state, updateAssetNumber: updateAssetNumber, searchItems: searchItems, id: id, person: person, item: item, unit: unit, record: record, held: held, pending: pending, reservationStart: reservationStart, pickupDeadline: pickupDeadline, awaitingToday: awaitingToday, remaining: remaining, rescheduleCapacity: rescheduleCapacity, canReschedule: canReschedule, rescheduleReservation: rescheduleReservation, displayDates: displayDates, daysBetween: daysBetween, addDays: addDays, validDates: validDates, capacity: capacity, outToday: outToday, futureReservations: futureReservations, makeBorrow: makeBorrow, pickupAvailability: pickupAvailability, pickup: pickup, returnQuantity: returnQuantity, cancelReservation: cancelReservation, affectedReservations: affectedReservations, extend: extend, respondExtension: respondExtension, sendHandover: sendHandover, respondHandover: respondHandover, daily: daily, acknowledge: acknowledge };
}));
