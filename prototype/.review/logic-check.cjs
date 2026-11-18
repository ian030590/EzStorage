const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const base = path.resolve(__dirname, '..');
let passed = 0;
function fresh() {
  const context = vm.createContext({ window: { crypto: webcrypto }, console });
  for (const name of ['data.js', 'logic.js']) vm.runInContext(fs.readFileSync(path.join(base, name), 'utf8'), context, { filename: name });
  return context.window.EZ;
}
function test(name, run) {
  try { run(fresh()); passed++; console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name + '\n' + error.stack); process.exitCode = 1; }
}
test('18 unique illustrated items, 10 units, two rooms, four types, nested box', E => {
  assert.equal(E.data.items.length, 18);
  assert.equal(new Set(E.data.items.map(i => i.image)).size, 18);
  assert.equal(E.data.units.length, 10);
  assert.equal(E.data.rooms.length, 2);
  assert.equal(new Set(E.data.units.map(u => u.type)).size, 4);
  assert.equal(E.unit('A2').parent, 'B1');
  assert.equal(E.unit('C1').layers, 0);
});
test('fixed day, today dark ratio, positive/zero/negative days', E => {
  assert.equal(E.state.today, '2026-11-15');
  assert.equal(E.outToday('emotion'), 3);
  assert.equal(E.outToday('number'), 3);
  assert.equal(E.daysBetween(E.state.today, E.record('r1').end), 0);
  assert.equal(E.daysBetween(E.state.today, E.record('r2').end), -1);
  assert.equal(E.daysBetween(E.state.today, E.record('r5').end), 3);
});
test('inclusive interval capacity uses peak concurrency and counts overdue today', E => {
  assert.equal(E.capacity('emotion', '2026-11-15', '2026-11-15'), 1);
  assert.equal(E.capacity('emotion', '2026-11-16', '2026-11-16'), 2);
  assert.equal(E.capacity('emotion', '2026-11-17', '2026-11-18'), 0);
  assert.equal(E.capacity('emotion', '2026-11-15', '2026-11-20'), 0);
  assert.equal(E.capacity('emotion', '2026-11-29', '2027-03-10'), 4);
});
test('scan today picks up immediately, custom name and audit events retained', E => {
  E.makeBorrow('lin', '林怡君（示範）', [{ itemId: 'action', quantity: 1, start: E.state.today, end: '2026-11-17' }], 'scan');
  const r = E.state.records.at(-1);
  assert.equal(E.held(r), 1);
  assert.equal(E.pending(r), 0);
  assert.equal(r.name, '林怡君（示範）');
  assert.equal(E.state.events.filter(e => e.ref === r.id).length, 2);
});
test('web today and scan future remain reservations; each item has separate dates', E => {
  E.makeBorrow('lin', '林怡君', [{ itemId: 'action', quantity: 1, start: E.state.today, end: '2026-11-16' }, { itemId: 'number', quantity: 1, start: '2026-11-21', end: '2026-11-24' }], 'web');
  assert.equal(E.pending(E.state.records.at(-2)), 1);
  assert.equal(E.held(E.state.records.at(-2)), 0);
  assert.equal(E.state.records.at(-1).start, '2026-11-21');
  E.makeBorrow('lin', '林怡君', [{ itemId: 'action', quantity: 1, start: '2026-11-20', end: '2026-11-22' }], 'scan');
  assert.equal(E.pending(E.state.records.at(-1)), 1);
});
test('invalid or over-capacity batch is atomic and cross-unit selections refused', E => {
  const count = E.state.records.length;
  assert.throws(() => E.makeBorrow('lin', '林怡君', [{ itemId: 'action', quantity: 1, start: E.state.today, end: '2026-11-17' }, { itemId: 'emotion', quantity: 1, start: E.state.today, end: '2026-11-20' }], 'scan'));
  assert.equal(E.state.records.length, count);
  assert.throws(() => E.makeBorrow('lin', '林怡君', [{ itemId: 'action', quantity: 1, start: E.state.today, end: '2026-11-17' }, { itemId: 'beads', quantity: 1, start: E.state.today, end: '2026-11-20' }], 'scan'));
  assert.throws(() => E.makeBorrow('lin', '林怡君', [{ itemId: 'action', quantity: 0, start: E.state.today, end: '2026-11-17' }], 'scan'));
  assert.equal(E.state.records.length, count);
});
test('pickup today and early pickup retain due date; unavailable early stock blocked', E => {
  E.pickup('r7', 'lin');
  assert.equal(E.held(E.record('r7')), 2);
  E.pickup('r20', 'lin');
  assert.equal(E.record('r20').start, '2026-11-15');
  assert.equal(E.record('r20').end, '2026-11-27');
  assert.equal(E.pickupAvailability(E.record('r3')).allowed, false);
  assert.throws(() => E.pickup('r3', 'wang'));
  assert.throws(() => E.pickup('r7', 'chen'));
});
test('partial return appends history and rejects excess quantities', E => {
  E.returnQuantity('r9', 1, 'lin');
  assert.equal(E.record('r9').returned, 2);
  assert.equal(E.held(E.record('r9')), 1);
  assert.equal(E.state.events.filter(e => e.type === 'return' && e.ref === 'r9').length, 2);
  assert.throws(() => E.returnQuantity('r9', 2, 'lin'));
});
test('manual and automatic cancellation preserve records', E => {
  const count = E.state.records.length;
  E.cancelReservation('r20', 'lin');
  assert.equal(E.record('r20').status, 'cancelled');
  assert.equal(E.record('r21').status, 'auto_cancelled');
  assert.equal(E.state.records.length, count);
  assert.ok(E.state.mails.some(m => m.type === 'auto_cancel' && m.refs.loanId === 'r21'));
});
test('pickup grace day allowed, following day auto-cancels', E => {
  E.daily('2026-11-16');
  assert.equal(E.pending(E.record('r7')), 2);
  assert.equal(E.pickupAvailability(E.record('r7')).allowed, true);
  E.daily('2026-11-17');
  assert.equal(E.record('r7').status, 'auto_cancelled');
  assert.equal(E.pending(E.record('r7')), 0);
});
test('extension before due with no affected reservation applies immediately, no product day cap', E => {
  E.extend('r5', 50);
  assert.equal(E.record('r5').end, '2027-01-07');
  E.extend('r5', 3650);
  assert.equal(E.state.requests.at(-1).status, 'applied');
  assert.throws(() => E.extend('r5', -1));
});
test('overlapping reservation with enough stock is unaffected', E => {
  assert.equal(E.affectedReservations(E.record('r13'), '2026-11-18').length, 0);
  E.extend('r13', 3);
  assert.equal(E.record('r13').end, '2026-11-18');
});
test('stock shortage identifies every affected holder and waits for all', E => {
  E.extend('r1', 3);
  const req = E.state.requests.at(-1);
  assert.equal(req.affected.length, 2);
  assert.equal(E.record('r1').end, '2026-11-15');
  assert.equal(E.state.mails.filter(m => m.refs.requestId === req.id && m.type === 'extension_request').length, 2);
  E.respondExtension(req.id, req.affected[0].recordId, true);
  assert.equal(E.record('r1').end, '2026-11-15');
  E.respondExtension(req.id, req.affected[1].recordId, true);
  assert.equal(E.record('r1').end, '2026-11-18');
  assert.equal(E.record('r3').start, '2026-11-19');
  assert.equal(E.record('r4').start, '2026-11-19');
  assert.equal(E.record('r3').end, '2026-11-24');
  assert.equal(E.record('r4').end, '2026-11-28');
  const eventCount = E.state.events.length;
  E.respondExtension(req.id, req.affected[1].recordId, true);
  assert.equal(E.state.events.length, eventCount);
});
test('disagreement keeps dates and sends both people the opposite contact', E => {
  E.extend('r1', 3);
  const req = E.state.requests.at(-1);
  E.respondExtension(req.id, req.affected[0].recordId, false);
  assert.equal(req.status, 'denied');
  assert.equal(E.record('r1').end, '2026-11-15');
  const mails = E.state.mails.filter(m => m.type === 'communication' && m.refs.requestId === req.id);
  assert.equal(mails.length, 2);
  assert.ok(mails.every(m => m.paragraphs.some(p => p.includes('example.com'))));
});
test('daily reminders and unanswered nudges repeat once per day and stop on reply', E => {
  const request = E.state.requests.find(r => r.status === 'pending');
  const count = E.state.mails.length;
  E.daily('2026-11-15');
  assert.equal(E.state.mails.length, count);
  E.daily('2026-11-16');
  assert.equal(E.state.mails.filter(m => m.refs.requestId === request.id && m.type.startsWith('nudge') && m.date === '2026-11-16').length, request.affected.length + 1);
  request.affected.forEach(answer => E.respondExtension(request.id, answer.recordId, true));
  E.daily('2026-11-17');
  assert.equal(E.state.mails.filter(m => m.refs.requestId === request.id && m.type.startsWith('nudge') && m.date === '2026-11-17').length, 0);
});
test('full return cancels pending request and stops nudges', E => {
  const req = E.state.requests.find(r => r.status === 'pending');
  E.returnQuantity('r11', 2, 'wu');
  assert.equal(req.status, 'cancelled');
  E.daily('2026-11-16');
  assert.equal(E.state.mails.filter(m => m.refs.requestId === req.id && m.type.startsWith('nudge') && m.date === '2026-11-16').length, 0);
});
test('handover permits several recipients, caps each and total, does not transfer on send', E => {
  assert.equal(E.futureReservations(E.record('r1'))[0].id, 'r3');
  assert.throws(() => E.sendHandover('r1', [{ recordId: 'r3', quantity: 3 }]));
  assert.throws(() => E.sendHandover('r1', [{ recordId: 'r3', quantity: 2 }, { recordId: 'r4', quantity: 1 }]));
  E.sendHandover('r1', [{ recordId: 'r3', quantity: 1 }, { recordId: 'r4', quantity: 1 }]);
  assert.equal(E.state.handovers.filter(h => h.loanId === 'r1').length, 2);
  assert.equal(E.held(E.record('r1')), 2);
});
test('handover confirmation records paired pickup/return, early start, leftover pending', E => {
  const h = E.state.handovers.find(h => h.status === 'pending');
  E.respondHandover(h.id, true);
  assert.equal(E.held(E.record('r13')), 1);
  assert.equal(E.held(E.record('r14')), 1);
  assert.equal(E.pending(E.record('r14')), 1);
  assert.equal(E.record('r14').start, '2026-11-15');
  assert.equal(E.record('r14').end, '2026-11-23');
  const count = E.state.events.length;
  E.respondHandover(h.id, true);
  assert.equal(E.state.events.length, count);
  E.daily('2026-11-17');
  assert.equal(E.held(E.record('r14')), 1);
  assert.equal(E.pending(E.record('r14')), 1);
  assert.equal(E.reservationStart(E.record('r14')), '2026-11-17');
  E.daily('2026-11-18');
  assert.equal(E.pending(E.record('r14')), 1);
  E.daily('2026-11-19');
  assert.equal(E.pending(E.record('r14')), 0);
  assert.equal(E.record('r14').cancelled, 1);
});
test('handover rejection keeps held stock and notifies original borrower', E => {
  const h = E.state.handovers.find(h => h.status === 'pending');
  E.respondHandover(h.id, false);
  assert.equal(h.status, 'rejected');
  assert.equal(E.held(E.record('r13')), 2);
  assert.ok(E.state.mails.some(m => m.type === 'handover_rejected' && m.refs.handoverId === h.id && m.to === 'lin'));
});
test('every required mail example exists and action links have unique tokens', E => {
  const types = new Set(E.state.mails.map(m => m.type));
  for (const type of ['reminder', 'extension_request', 'extension_applied', 'communication', 'nudge_borrower', 'nudge_holder', 'handover', 'handover_rejected', 'auto_cancel']) assert.ok(types.has(type));
  assert.ok(E.state.mails.some(m => m.subject.startsWith('到期') && m.actions.length === 1));
  assert.ok(E.state.mails.some(m => m.subject.startsWith('到期') && m.actions.length === 2));
  assert.ok(E.state.mails.some(m => m.subject.startsWith('逾期') && m.paragraphs.some(p => p.includes('example.com'))));
  assert.equal(new Set(E.state.mails.map(m => m.token)).size, E.state.mails.length);
});
test('missing 3D dependency keeps tag selection and deselection functional', E => {
  const elements = [];
  function element() {
    const e = { children: [], style: {}, attributes: {}, events: {}, classList: { add() {} }, append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); }, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, callback) { this.events[key] = callback; } };
    elements.push(e);
    return e;
  }
  const context = vm.createContext({ window: { EZData: E.data, matchMedia: () => ({ matches: true }) }, document: { createElement: element, createElementNS: element } });
  vm.runInContext(fs.readFileSync(path.join(base, 'room3d.js'), 'utf8'), context);
  const chosen = [];
  const view = new context.window.EZRoom(element(), '1', code => chosen.push(code));
  view.select('A1', null);
  elements.find(e => e.textContent === 'A1').events.click();
  elements.find(e => e.textContent === 'B1').events.click();
  assert.deepEqual(chosen, [null, 'B1']);
  view.destroy();
});
test('demo user is both a pending applicant and an unanswered holder', E => {
  assert.ok(E.state.requests.some(req => req.status === 'pending' && E.record(req.loanId).userId === 'lin'));
  assert.ok(E.state.requests.some(req => req.status === 'pending' && E.record(req.loanId).userId !== 'lin' && req.affected.some(answer => E.record(answer.recordId).userId === 'lin' && answer.response === null)));
});
test('remaining uses picked and awaiting today, excludes future handover remainder', E => {
  assert.equal(E.remaining('emotion'), 1);
  assert.equal(E.remaining('number'), 3);
  const h = E.state.handovers.find(h => h.status === 'pending');
  E.respondHandover(h.id, true);
  assert.equal(E.outToday('peg'), 2);
  assert.equal(E.remaining('peg'), 2);
  assert.equal(E.awaitingToday(E.record('r14')), 0);
  assert.equal(E.pickupDeadline(E.record('r14')), '2026-11-18');
});
test('each handover quantity records its own confirmation day, original window stays', E => {
  const first = E.state.handovers.find(h => h.status === 'pending');
  E.respondHandover(first.id, true);
  E.state.today = '2026-11-16';
  E.sendHandover('r13', [{ recordId: 'r14', quantity: 1 }]);
  E.respondHandover(E.state.handovers.at(-1).id, true);
  const pickups = E.state.events.filter(event => event.ref === 'r14' && event.type === 'pickup');
  assert.equal(pickups[0].details.start, '2026-11-15');
  assert.equal(pickups[1].details.start, '2026-11-16');
  assert.equal(E.reservationStart(E.record('r14')), '2026-11-17');
});
test('overdue holds count today but return on original due date for future capacity', E => {
  assert.equal(E.held(E.record('r18')), 1);
  assert.equal(E.held(E.record('r19')), 1);
  assert.equal(E.outToday('hoop'), 2);
  assert.equal(E.capacity('hoop', '2026-11-15', '2026-11-15'), 3);
  assert.equal(E.capacity('hoop', '2026-11-16', '2026-11-17'), 4);
});
test('reschedule changes all three values, excludes own reservation and emails owner', E => {
  const count = E.state.records.length;
  E.rescheduleReservation('r20', { start: '2026-11-23', end: '2026-11-29', quantity: 3 }, 'lin');
  assert.equal(E.record('r20').start, '2026-11-23');
  assert.equal(E.record('r20').end, '2026-11-29');
  assert.equal(E.pending(E.record('r20')), 3);
  assert.equal(E.state.records.length, count);
  const audit = E.state.events.find(event => event.type === 'reschedule' && event.ref === 'r20');
  assert.equal(audit.details.before.quantity, 1);
  assert.equal(audit.details.before.start, '2026-11-22');
  assert.equal(audit.details.after.quantity, 3);
  assert.ok(E.state.mails.some(m => m.type === 'reschedule' && m.to === 'lin' && m.refs.reservationId === 'r20' && m.paragraphs.some(p => p.includes('11/29') && p.includes('3 件'))));
});
test('awaiting reservations can reschedule on and after their start date', E => {
  E.rescheduleReservation('r7', { start: '2026-11-15', end: '2026-11-21', quantity: 3 }, 'lin');
  assert.equal(E.held(E.record('r7')), 0);
  E.daily('2026-11-16');
  assert.equal(E.canReschedule(E.record('r7')), true);
  E.rescheduleReservation('r7', { start: '2026-11-15', end: '2026-11-22', quantity: 4 }, 'lin');
  assert.equal(E.pending(E.record('r7')), 4);
  assert.equal(E.record('r7').start, '2026-11-15');
});
test('reschedule rejects unavailable quantity atomically and respects ownership/pickup', E => {
  const eventCount = E.state.events.length;
  assert.throws(() => E.rescheduleReservation('r7', { start: '2026-11-15', end: '2026-11-20', quantity: 6 }, 'lin'), /最多可借 5 件/);
  assert.equal(E.pending(E.record('r7')), 2);
  assert.equal(E.state.events.length, eventCount);
  assert.throws(() => E.rescheduleReservation('r7', { start: '2026-11-15', end: '2026-11-20', quantity: 1 }, 'chen'));
  assert.throws(() => E.rescheduleReservation('r1', { start: '2026-11-15', end: '2026-11-20', quantity: 1 }, 'lin'));
  E.pickup('r7', 'lin');
  assert.equal(E.canReschedule(E.record('r7')), false);
});
test('holder rescheduling out of affected interval needs no reply; remaining agreement applies', E => {
  const req = E.state.requests.find(req => req.loanId === 'r11' && req.status === 'pending');
  E.rescheduleReservation('r24', { start: '2026-11-22', end: '2026-11-27', quantity: 1 }, 'lin');
  assert.equal(req.affected.find(answer => answer.recordId === 'r24').noReplyNeeded, true);
  assert.equal(req.status, 'pending');
  const eventCount = E.state.events.length;
  E.respondExtension(req.id, 'r24', false);
  assert.equal(E.state.events.length, eventCount);
  E.respondExtension(req.id, 'r12', true);
  assert.equal(req.status, 'applied');
  assert.equal(E.record('r11').end, '2026-11-19');
  assert.equal(E.record('r24').start, '2026-11-22');
  assert.equal(E.record('r12').start, '2026-11-20');
  assert.ok(E.state.mails.some(m => m.type === 'extension_applied' && m.refs.loanId === 'r11'));
});
test('holder rescheduling within affected interval still must reply', E => {
  const req = E.state.requests.find(req => req.loanId === 'r11' && req.status === 'pending');
  E.rescheduleReservation('r24', { start: '2026-11-18', end: '2026-11-25', quantity: 1 }, 'lin');
  assert.equal(req.affected.find(answer => answer.recordId === 'r24').noReplyNeeded, false);
  E.respondExtension(req.id, 'r12', true);
  assert.equal(req.status, 'pending');
  E.respondExtension(req.id, 'r24', true);
  assert.equal(req.status, 'applied');
  assert.equal(E.record('r24').start, '2026-11-20');
  assert.equal(E.record('r24').end, '2026-11-25');
});
test('cancelled unanswered holder no longer blocks extension', E => {
  const req = E.state.requests.find(req => req.loanId === 'r11' && req.status === 'pending');
  E.cancelReservation('r24', 'lin');
  assert.equal(req.affected.find(answer => answer.recordId === 'r24').noReplyNeeded, true);
  E.respondExtension(req.id, 'r12', true);
  assert.equal(req.status, 'applied');
  assert.equal(E.record('r24').status, 'cancelled');
  assert.equal(E.record('r24').start, '2026-11-17');
});
test('all waived by reschedule apply extension without any approval', E => {
  const req = E.state.requests.find(req => req.loanId === 'r1' && req.status === 'pending');
  E.rescheduleReservation('r3', { start: '2026-11-29', end: '2026-12-02', quantity: 2 }, 'wang');
  assert.equal(req.status, 'applied');
  assert.ok(req.affected.every(answer => answer.noReplyNeeded && answer.response === null));
  assert.equal(E.record('r1').end, '2026-11-18');
  assert.equal(E.record('r3').start, '2026-11-29');
  assert.equal(E.record('r4').start, '2026-11-17');
  assert.ok(E.state.mails.some(m => m.type === 'extension_applied' && m.refs.loanId === 'r1'));
});
test('new extension replaces pending request and old mail actions cannot affect it', E => {
  const previous = E.state.requests.find(req => req.loanId === 'r1' && req.status === 'pending');
  E.extend('r1', 5);
  const req = E.state.requests.at(-1);
  assert.equal(previous.status, 'void');
  assert.equal(req.newEnd, '2026-11-20');
  assert.equal(E.state.requests.filter(req => req.loanId === 'r1' && req.status === 'pending').length, 1);
  assert.equal(E.state.mails.filter(m => m.type === 'extension_request' && m.refs.requestId === req.id).length, 2);
  const eventCount = E.state.events.length;
  E.respondExtension(previous.id, previous.affected[0].recordId, false);
  assert.equal(E.state.events.length, eventCount);
  assert.equal(req.status, 'pending');
  assert.equal(E.record('r1').end, '2026-11-15');
});
test('invalid replacement preserves old request; replacement with enough stock applies immediately', E => {
  const previous = E.state.requests.find(req => req.loanId === 'r1' && req.status === 'pending');
  assert.throws(() => E.extend('r1', 0));
  assert.equal(previous.status, 'pending');
  E.extend('r1', 1);
  assert.equal(previous.status, 'void');
  assert.equal(E.state.requests.at(-1).status, 'applied');
  assert.equal(E.record('r1').end, '2026-11-16');
});
test('due equal to holder end retains dates through end and auto-ends next morning', E => {
  E.extend('r1', 9);
  const req = E.state.requests.at(-1);
  req.affected.forEach(answer => E.respondExtension(req.id, answer.recordId, true));
  assert.equal(E.record('r1').end, '2026-11-24');
  assert.equal(E.record('r3').start, '2026-11-16');
  assert.equal(E.record('r3').end, '2026-11-24');
  assert.equal(E.record('r3').keepUntilEnd, true);
  assert.equal(E.record('r4').start, '2026-11-25');
  E.daily('2026-11-18');
  assert.equal(E.pending(E.record('r3')), 2);
  E.daily('2026-11-24');
  assert.equal(E.pending(E.record('r3')), 2);
  E.daily('2026-11-25');
  assert.equal(E.pending(E.record('r3')), 0);
  const mail = E.state.mails.find(m => m.type === 'auto_cancel' && m.refs.loanId === 'r3');
  assert.ok(mail.paragraphs.some(p => p.includes('新歸還日') && p.includes('原訂歸還日')));
});
test('extension beyond holder end retains original dates and holder can reschedule', E => {
  E.extend('r1', 20);
  const req = E.state.requests.at(-1);
  req.affected.forEach(answer => E.respondExtension(req.id, answer.recordId, true));
  assert.equal(E.record('r3').start, '2026-11-16');
  assert.equal(E.record('r4').start, '2026-11-17');
  assert.equal(E.record('r4').end, '2026-11-28');
  E.rescheduleReservation('r3', { start: '2026-12-06', end: '2026-12-12', quantity: 2 }, 'wang');
  assert.equal(E.record('r3').keepUntilEnd, false);
  assert.equal(E.pickupDeadline(E.record('r3')), '2026-12-07');
});
test('retained reservation may still pick up after normal grace when stock is available', E => {
  E.extend('r1', 9);
  const req = E.state.requests.at(-1);
  req.affected.forEach(answer => E.respondExtension(req.id, answer.recordId, true));
  E.daily('2026-11-20');
  E.returnQuantity('r1', 2, 'lin');
  assert.equal(E.pickupAvailability(E.record('r3')).allowed, true);
  E.pickup('r3', 'wang');
  assert.equal(E.held(E.record('r3')), 2);
  assert.equal(E.record('r3').start, '2026-11-20');
  assert.equal(E.record('r3').end, '2026-11-24');
});
function orbitHarness() {
  const handlers = new Map();
  const captured = new Set();
  let updates = 0;
  const clicks = [];
  const canvas = {
    clientHeight: 500,
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
    removeEventListener(name, fn) { handlers.set(name, handlers.get(name).filter(candidate => candidate !== fn)); },
    setPointerCapture(id) { captured.add(id); },
    hasPointerCapture(id) { return captured.has(id); },
    releasePointerCapture(id) { captured.delete(id); }
  };
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(base, 'room3d.js'), 'utf8'), context);
  const orbit = new context.window.EZRoomOrbit(canvas, () => updates++, event => clicks.push(event));
  function emit(type, values = {}) {
    const event = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100, deltaMode: 0, deltaY: 0, preventDefault() { this.prevented = true; }, ...values };
    (handlers.get(type) || []).forEach(fn => fn(event));
    return event;
  }
  return { orbit, clicks, emit, updates: () => updates, captured };
}
test('mouse orbit distinguishes clicks from drags and next click still works', () => {
  const h = orbitHarness();
  const original = h.orbit.azimuth;
  h.emit('pointerdown'); h.emit('pointerup', { clientX: 104 });
  assert.equal(h.clicks.length, 1);
  h.emit('pointerdown'); h.emit('pointermove', { clientX: 300 }); h.emit('pointerup', { clientX: 300 });
  assert.notEqual(h.orbit.azimuth, original);
  assert.equal(h.clicks.length, 1);
  h.emit('pointerdown'); h.emit('pointerup');
  assert.equal(h.clicks.length, 2);
  assert.equal(h.captured.size, 0);
  h.orbit.destroy();
});
test('touch orbit clamps tilt above floor and supports full horizontal rotation', () => {
  const h = orbitHarness();
  const original = h.orbit.azimuth;
  h.emit('pointerdown', { pointerType: 'touch' });
  h.emit('pointermove', { pointerType: 'touch', clientX: 3000, clientY: -100000 });
  assert.equal(h.orbit.polar, 1.4);
  assert.ok(Math.abs(h.orbit.azimuth - original) > Math.PI * 2);
  h.emit('pointermove', { pointerType: 'touch', clientY: 100000 });
  assert.equal(h.orbit.polar, .18);
  assert.ok(Math.cos(h.orbit.polar) > 0);
  h.emit('pointerup', { pointerType: 'touch', clientY: 100000 });
  assert.equal(h.clicks.length, 0);
});
test('wheel and pinch zoom are bounded and pinch never selects a unit', () => {
  const h = orbitHarness();
  for (let i = 0; i < 8; i++) assert.equal(h.emit('wheel', { deltaY: 100000 }).prevented, true);
  assert.equal(h.orbit.zoom, .7);
  for (let i = 0; i < 8; i++) h.emit('wheel', { deltaY: -100000 });
  assert.equal(h.orbit.zoom, 1.6);
  h.emit('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 0 });
  h.emit('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 200 });
  h.emit('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 50 });
  assert.equal(h.orbit.zoom, .7);
  h.emit('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 500 });
  assert.equal(h.orbit.zoom, 1.6);
  h.emit('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 500 });
  h.emit('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 0 });
  assert.equal(h.clicks.length, 0);
  h.orbit.destroy();
  const updates = h.updates();
  h.emit('wheel', { deltaY: 100 });
  assert.equal(h.updates(), updates);
});
test('demo user has an early partial handover with an editable unpicked remainder', E => {
  const r = E.record('r19');
  assert.equal(r.userId, 'lin');
  assert.equal(r.start, '2026-11-15');
  assert.equal(E.reservationStart(r), '2026-11-18');
  assert.equal(E.held(r), 1);
  assert.equal(E.pending(r), 1);
  assert.equal(E.canReschedule(r), true);
});
test('partial reschedule preserves received borrow and creates a linked reservation', E => {
  const original = E.record('r19');
  const count = E.state.records.length;
  E.rescheduleReservation('r19', { start: '2026-11-26', end: '2026-11-29', quantity: 2 }, 'lin');
  const child = E.state.records.find(r => r.rescheduledFrom === 'r19');
  assert.ok(child);
  assert.equal(E.state.records.length, count + 1);
  assert.equal(original.start, '2026-11-15');
  assert.equal(original.end, '2026-11-25');
  assert.equal(original.quantity, 2);
  assert.equal(original.picked, 1);
  assert.equal(original.returned, 0);
  assert.equal(original.cancelled, 0);
  assert.equal(original.status, 'active');
  assert.equal(E.held(original), 1);
  assert.equal(E.pending(original), 0);
  assert.equal(child.start, '2026-11-26');
  assert.equal(child.end, '2026-11-29');
  assert.equal(E.pending(child), 2);
  assert.equal(E.held(child), 0);
  assert.equal(E.outToday('hoop'), 2);
  assert.ok(E.state.events.some(event => event.type === 'reservation_split' && event.ref === original.id && event.details.reservationId === child.id));
  assert.ok(E.state.mails.some(mail => mail.type === 'reschedule' && mail.refs.reservationId === child.id && mail.to === 'lin'));
});
test('partial reschedule excludes only pending stock and still counts own received quantity', E => {
  const r = E.record('r19');
  const count = E.state.records.length;
  assert.equal(E.rescheduleCapacity(r, '2026-11-15', '2026-11-20'), 3);
  assert.throws(() => E.rescheduleReservation(r.id, { start: '2026-11-15', end: '2026-11-20', quantity: 4 }, 'lin'), /最多可借 3 件/);
  assert.equal(E.state.records.length, count);
  assert.equal(E.pending(r), 1);
  assert.equal(E.held(r), 1);
  E.rescheduleReservation(r.id, { start: '2026-11-15', end: '2026-11-20', quantity: 3 }, 'lin');
  assert.equal(E.remaining('hoop'), 0);
});
test('rescheduled remainder has an independent pickup window and return lifecycle', E => {
  E.rescheduleReservation('r19', { start: '2026-11-26', end: '2026-11-29', quantity: 2 }, 'lin');
  const child = E.state.records.find(r => r.rescheduledFrom === 'r19');
  assert.equal(E.pickupDeadline(child), '2026-11-27');
  E.returnQuantity('r19', 1, 'lin');
  assert.equal(E.record('r19').status, 'returned');
  assert.equal(E.pending(child), 2);
  E.pickup(child.id, 'lin');
  assert.equal(E.held(child), 2);
  assert.equal(child.end, '2026-11-29');
  assert.equal(E.record('r19').end, '2026-11-25');
});
test('auto-cancelling rescheduled remainder never cancels received borrow', E => {
  E.rescheduleReservation('r19', { start: '2026-11-26', end: '2026-11-29', quantity: 2 }, 'lin');
  const child = E.state.records.find(r => r.rescheduledFrom === 'r19');
  E.daily('2026-11-27');
  assert.equal(E.pending(child), 2);
  E.daily('2026-11-28');
  assert.equal(child.status, 'auto_cancelled');
  assert.equal(E.held(E.record('r19')), 1);
  assert.equal(E.record('r19').status, 'active');
});
test('mail and receipt dates use MM/DD while stored dates remain ISO', E => {
  E.makeBorrow('lin', '林怡君', [{ itemId: 'action', quantity: 1, start: '2026-11-15', end: '2026-11-17' }], 'scan');
  E.rescheduleReservation('r20', { start: '2026-11-23', end: '2026-11-29', quantity: 2 }, 'lin');
  E.extend('r5', 50);
  assert.equal(E.record('r5').end, '2027-01-07');
  assert.ok(E.state.receipts.some(r => r.paragraphs.some(p => p.includes('01/07'))));
  for (const mail of E.state.mails) assert.doesNotMatch([mail.subject, ...mail.paragraphs].join(' '), /\b\d{4}-\d{2}-\d{2}\b/);
  for (const receipt of E.state.receipts) assert.doesNotMatch([receipt.title, ...receipt.paragraphs].join(' '), /\b\d{4}-\d{2}-\d{2}\b/);
});
test('phone tag placement separates all 44px hit boxes at 390px width', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(base, 'room3d.js'), 'utf8'), context);
  const points = Array.from({ length: 6 }, () => ({ x: 175, y: 170 }));
  const tags = context.window.EZPlaceRoomTags(points, 390, 380);
  assert.equal(tags.length, 6);
  for (const tag of tags) assert.ok(tag.x >= 24 && tag.x <= 366 && tag.y >= 26 && tag.y <= 285);
  for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) assert.ok(Math.abs(tags[i].x - tags[j].x) >= 44 || Math.abs(tags[i].y - tags[j].y) >= 44);
});
console.log(passed + ' domain, input and layout scenarios passed.');
