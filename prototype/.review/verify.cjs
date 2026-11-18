const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..');
const fileURL = 'file:///' + root.replaceAll('\\', '/') + '/prototype/index.html';
const output = __dirname;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let sequence = 0;
const waiting = new Map();
const exceptions = [];
const failures = [];
async function connect() {
  const targets = await (await fetch('http://127.0.0.1:9335/json')).json();
  const target = targets.find(entry => entry.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const value = JSON.parse(event.data);
    if (value.id) {
      const request = waiting.get(value.id);
      if (request) { waiting.delete(value.id); value.error ? request.reject(value.error) : request.resolve(value.result); }
    } else if (value.method === 'Runtime.exceptionThrown') {
      exceptions.push(value.params.exceptionDetails.exception?.description || value.params.exceptionDetails.text);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('CDP command timed out: ' + method)); }, 30000);
    waiting.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await pause(120);
  }
  throw new Error('Timed out: ' + expression);
}
async function navigate(url = fileURL) {
  await send('Page.navigate', { url: 'about:blank' });
  await until('location.href === "about:blank" && document.readyState === "complete"');
  await send('Page.navigate', { url });
  await until('location.href === ' + JSON.stringify(url), 30000);
  await until('document.readyState === "complete"', 30000);
  if (url.includes('/prototype/')) await until('!!window.EZ && !!document.querySelector(".page,.room-layout")');
  await pause(250);
}
async function route(hash) {
  await evaluate('location.hash=' + JSON.stringify(hash));
  await pause(180);
}
async function click(selector) {
  await evaluate('(()=>{const e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)throw Error("Missing control: "+' + JSON.stringify(selector) + ');e.click()})()');
  await pause(180);
}
async function fill(selector, value) {
  await evaluate('(()=>{const e=document.querySelector(' + JSON.stringify(selector) + ');e.value=' + JSON.stringify(String(value)) + ';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()');
}
async function login() { await click('[data-account="lin"]'); await until('EZ.state.user && EZ.state.user.id === "lin"'); }
async function screenshot(name) {
  await evaluate('document.fonts.ready');
  await pause(650);
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(image.data, 'base64'));
}
async function viewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 900 });
}
async function check(name, expression) {
  const value = await evaluate(expression);
  assert.ok(value, name + ': ' + JSON.stringify(value));
  console.log('PASS ' + name);
}
async function scenario(name, fn) {
  try { await fn(); } catch (error) { failures.push(name + ': ' + error.message); console.log('FAIL ' + name + ': ' + error.message); }
}
async function main() {
  await connect();
  await viewport(1440, 900);
  if (process.argv.includes('--capture')) {
    await navigate('file:///' + root.replaceAll('\\', '/') + '/.impeccable/mocks/decision/assigned.html');
    await screenshot('approved');
    await navigate();
    await screenshot('desktop');
    console.log('INITIAL', await evaluate('JSON.stringify({three:!!window.THREE,qr:!!window.qrcode,tags:document.querySelectorAll(".unit-tag").length,overflow:document.documentElement.scrollWidth>innerWidth,panel:document.querySelector(".info-panel").getBoundingClientRect().width,canvas:!!document.querySelector("canvas")})'));
    await viewport(390, 844);
    await screenshot('mobile');
    console.log('MOBILE', await evaluate('JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth,tagRects:[...document.querySelectorAll(".unit-tag")].map(e=>({code:e.textContent,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y}))})'));
    return;
  }
  await scenario('initial room', async () => {
    await navigate();
    await check('Three.js r128 and QR library load over file', 'THREE.REVISION === "128" && typeof qrcode === "function"');
    await check('public A1 panel, dates, dark overlay, no email', 'document.querySelector(".panel-tag").textContent==="A1" && !document.querySelector(".info-panel").textContent.includes("@") && document.querySelector(".title-block").textContent.includes("2026/11/15") && document.querySelector(".dark").style.height==="75%"');
    await check('positive, zero, negative day values', '[...document.querySelectorAll(".days")].some(e=>+e.textContent>0)&&[...document.querySelectorAll(".days")].some(e=>+e.textContent===0)&&[...document.querySelectorAll(".days.late")].some(e=>+e.textContent<0)');
    await screenshot('desktop');
    for (const code of ['B1', 'A2', 'B2', 'A3', 'C1', 'A1']) await click('.unit-tag[aria-label^="' + code + ' "]');
    await click('[data-layer="2"]');
    await check('layer scopes A1 and tag restores whole unit', 'document.querySelectorAll(".inventory-item").length===2');
    await click('.unit-tag[aria-label^="A1 "]');
    await check('tag restores all A1 layers', 'document.querySelectorAll(".inventory-item").length===5');
    await click('.unit-tag[aria-label^="A1 "]');
    await check('tag deselects unit to room overview', 'document.querySelectorAll(".room-unit-list button").length===6');
    await click('[data-unit="A1"]');
    await click('[data-room="2"]');
    await check('room switch rebuilds four units', 'document.querySelectorAll(".unit-tag").length===4 && document.querySelector(".panel-tag").textContent==="D1"');
    await click('[data-room="1"]');
    await viewport(390, 844);
    await screenshot('mobile');
    await check('390px room has no horizontal overflow and 44px tags', 'document.documentElement.scrollWidth===innerWidth && [...document.querySelectorAll(".unit-tag")].every(e=>e.getBoundingClientRect().width>=44)');
    await check('phone tags show 30px circles without overlapping hit areas', '(()=>{const tags=[...document.querySelectorAll(".unit-tag")];return tags.every(t=>parseFloat(getComputedStyle(t,"::before").width)===30)&&tags.every((a,i)=>tags.slice(i+1).every(b=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top}))})()');
    await check('phone borrower and next rows keep name and quantity on first line', '[...document.querySelectorAll(".borrower-row,.next-row")].every(row=>getComputedStyle(row.firstElementChild).whiteSpace==="nowrap"&&row.querySelector(".date-range").getBoundingClientRect().top>row.firstElementChild.getBoundingClientRect().top)');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await click('.unit-tag[aria-label^="A3 "]');
    await check('reduced motion selection works', 'matchMedia("(prefers-reduced-motion: reduce)").matches && document.querySelector(".panel-tag").textContent==="A3"');
    await send('Emulation.setEmulatedMedia', { features: [] });
    await viewport(1440, 900);
  });
  await scenario('scan borrowing and validation', async () => {
    await navigate(fileURL + '#/scan/item/emotion');
    await check('scan requires sign-in first', 'document.querySelector("dialog").open');
    await login();
    await check('three scan actions', 'document.querySelectorAll(".scan-choice").length===3');
    await click('[data-scan-action="borrow"]');
    await check('item QR prechecks that item only', 'document.querySelector("#check-emotion").checked && [...document.querySelectorAll("input[type=checkbox]:checked")].length===1');
    await fill('#end-emotion', '2026-11-20');
    await check('full interval prevents overbooking', 'document.querySelector("#quantity-emotion").max==="0" && document.querySelector("#borrow-submit").disabled && document.querySelector("#stock-emotion").textContent.includes("最多可借 0 件")');
    await click('#check-emotion');
    await click('#check-action');
    await fill('#end-action', '2026-11-16');
    await fill('#borrow-name', '林怡君（示範）');
    await click('#borrow-submit');
    await check('scan today is immediately picked up, editable name retained', 'EZ.state.records.some(r=>r.itemId==="action"&&r.name==="林怡君（示範）"&&EZ.held(r)===1&&r.start===EZ.state.today)');
    await route('#/mine');
    await check('mine has scan instructions, no pickup or return controls', 'document.body.textContent.includes("請到現場掃碼領取")&&document.body.textContent.includes("請到現場掃碼歸還")&&!document.querySelector("[data-pickup],[data-return]")');
    await screenshot('mine');
  });
  await scenario('web reservation and scan pickup', async () => {
    await navigate();
    await click('.panel-header .button');
    await login();
    await click('#check-number');
    await fill('#end-number', '2026-11-20');
    await click('#borrow-submit');
    await check('web today stays pending on-site pickup', 'EZ.state.records.some(r=>r.itemId==="number"&&r.id!=="r7"&&r.userId==="lin"&&EZ.pending(r)===1&&EZ.held(r)===0)');
    await route('#/scan/unit/A1');
    await click('[data-scan-action="pickup"]');
    await click('[data-pickup="r7"]');
    await check('scan pickup records reserved quantity', 'EZ.held(EZ.record("r7"))===2&&EZ.pending(EZ.record("r7"))===0');
    await route('#/scan/unit/D3/pickup');
    await click('[data-pickup="r20"]');
    await check('early pickup moves start and keeps due date', 'EZ.record("r20").start==="2026-11-15"&&EZ.record("r20").end==="2026-11-27"&&EZ.held(EZ.record("r20"))===1');
  });
  await scenario('partial return and cancellation', async () => {
    await navigate(fileURL + '#/scan/unit/B1');
    await login();
    await click('[data-scan-action="return"]');
    await click('[data-return="r9"] [type=submit]');
    await check('partial returns keep history and remaining held quantity', 'EZ.record("r9").returned===2&&EZ.held(EZ.record("r9"))===1&&EZ.state.events.filter(e=>e.ref==="r9"&&e.type==="return").length===2');
    await route('#/mine');
    await click('[data-cancel="r20"]');
    await check('cancel changes status, record remains', 'EZ.record("r20").status==="cancelled"&&EZ.state.records.length===24&&EZ.state.events.some(e=>e.ref==="r20"&&e.type==="cancel")');
  });
  await scenario('unaffected extension before due', async () => {
    await navigate(fileURL + '#/mine');
    await login();
    await click('a[href="#/extend/r5"]');
    await fill('#extend-days', 50);
    await click('#extend-form [type=submit]');
    await check('unlimited extension applies immediately if enough stock', 'EZ.record("r5").end==="2027-01-07"&&document.querySelector("h1").textContent.includes("立即生效")');
  });
  await scenario('reschedule and both pending views in mine', async () => {
    await navigate(fileURL + '#/mine');
    await login();
    await check('demo user sees applicant and affected-holder states', 'document.querySelector(".extension-pending").textContent.includes("11/18")&&document.querySelector(".extension-pending").textContent.includes("王思妤")&&!!document.querySelector("[data-extension-reply=agree][data-reservation=r24]")');
    await click('[data-extension-reply=agree][data-reservation=r24]');
    await check('mine agreement uses same request as mail and waits for other holder', '(()=>{const req=EZ.state.requests.find(r=>r.loanId==="r11"&&r.status==="pending");return req.affected.find(a=>a.recordId==="r24").response===true&&EZ.record("r11").end==="2026-11-16"})()');
    await route('#/mine');
    await click('a[href="#/reschedule/r20"]');
    await fill('#reschedule-start', '2026-11-23');
    await fill('#reschedule-end', '2026-11-29');
    await fill('#reschedule-quantity', 3);
    await click('#reschedule-submit');
    await check('saved dates and quantity shown and confirmation email created', 'document.querySelector(".result").textContent.includes("11/29")&&document.querySelector(".result").textContent.includes("3 件")&&EZ.state.mails.some(m=>m.type==="reschedule"&&m.to==="lin"&&m.refs.reservationId==="r20")');
    await route('#/mine');
    await click('a[href="#/reschedule/r7"]');
    await fill('#reschedule-quantity', 6);
    await check('reschedule caps availability and prevents overbooking', 'document.querySelector("#reschedule-submit").disabled&&document.querySelector("#reschedule-quantity").max==="5"&&document.querySelector("#reschedule-stock").textContent==="這段期間最多可借 5 件"');
    await fill('#reschedule-quantity', 3);
    await click('#reschedule-submit');
    await evaluate('EZ.daily("2026-11-16")');
    await route('#/mine');
    await click('a[href="#/reschedule/r7"]');
    await fill('#reschedule-end', '2026-11-22');
    await click('#reschedule-submit');
    await check('past-start awaiting reservation remains editable', 'EZ.record("r7").start==="2026-11-15"&&EZ.record("r7").end==="2026-11-22"&&EZ.held(EZ.record("r7"))===0');
    await route('#/mine');
    await click('a[href="#/extend/r1"]');
    await fill('#extend-days', 5);
    await click('#extend-form [type=submit]');
    await route('#/mine');
    await check('resubmission replaces old pending state', 'EZ.state.requests.some(r=>r.loanId==="r1"&&r.status==="void")&&document.querySelector(".extension-pending").textContent.includes("11/20")');
    await screenshot('mine-pending');
    await route('#/room/1');
    await check('public room still excludes pending extension state', '!document.querySelector(".info-panel").textContent.includes("延長申請中")&&!document.querySelector(".info-panel").textContent.includes("待你回覆")');
  });
  await scenario('canvas drag, zoom and unit selection after rotation', async () => {
    await viewport(1440, 900);
    await navigate();
    const center = await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.8}})()');
    const before = await evaluate('document.querySelector(".unit-tag").style.left');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: center.x, y: center.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x + 60, y: center.y + 15, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: center.x + 60, y: center.y + 15, button: 'left', clickCount: 1 });
    await pause(350);
    await check('drag rotates tags without selecting or deselecting', 'document.querySelector(".unit-tag").style.left!==' + JSON.stringify(before) + '&&document.querySelector(".panel-tag").textContent==="A1"');
    const point = await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();const l=document.querySelectorAll(".leader-lines line")[3];return {x:r.x+Number(l.getAttribute("x1")),y:r.y+Number(l.getAttribute("y1"))+8}})()');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(250);
    await check('rotated camera raycast selects B2', 'document.querySelector(".panel-tag").textContent==="B2"');
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: center.x, y: center.y, deltaX: 0, deltaY: -250 });
    await pause(300);
    await click('.unit-tag[aria-label^="B1 "]');
    await check('projected HTML tag still selects after zoom', 'document.querySelector(".panel-tag").textContent==="B1"');
  });
  await scenario('reschedule only the remaining part of the demo early handover', async () => {
    await navigate(fileURL + '#/mine');
    await login();
    await click('a[href="#/reschedule/r19"]');
    await check('received part is identified separately from editable remainder', 'document.querySelector(".page").textContent.includes("只修改未領取的 1 件")&&document.querySelector(".page").textContent.includes("11/25")&&document.querySelector("#reschedule-quantity").value==="1"');
    await fill('#reschedule-start', '2026-11-26');
    await fill('#reschedule-end', '2026-11-29');
    await fill('#reschedule-quantity', 2);
    await click('#reschedule-submit');
    await check('partial reschedule preserves active borrow and links new reservation', '(()=>{const source=EZ.record("r19"),child=EZ.state.records.find(r=>r.rescheduledFrom==="r19");return source.start==="2026-11-15"&&source.end==="2026-11-25"&&EZ.held(source)===1&&EZ.pending(source)===0&&child.start==="2026-11-26"&&child.end==="2026-11-29"&&EZ.pending(child)===2})()');
    await check('result text uses MM/DD', 'document.querySelector(".result").textContent.includes("11/26")&&!/\b\d{4}-\d{2}-\d{2}\b/.test(document.querySelector(".result").textContent)');
  });
  await scenario('affected extension, all agreements without login', async () => {
    await navigate(fileURL + '#/mine');
    await login();
    await click('a[href="#/extend/r1"]');
    await fill('#extend-days', 3);
    await click('#extend-form [type=submit]');
    await check('only stock-conflicting reservers receive requests', '(()=>{const req=EZ.state.requests.at(-1);return req.affected.length===2&&EZ.record("r1").end==="2026-11-15"&&EZ.state.mails.filter(m=>m.refs.requestId===req.id&&m.type==="extension_request").length===2})()');
    const messages = await evaluate('EZ.state.mails.filter(m=>m.refs.requestId===EZ.state.requests.at(-1).id&&m.type==="extension_request").map(m=>({id:m.id,token:m.token}))');
    await evaluate('EZ.state.user=null;document.querySelector("#account").textContent="以 Google 登入"');
    await route('#/mail/' + messages[0].id);
    await click('a[href$="/agree"]');
    await check('one agreement keeps original due date', 'EZ.record("r1").end==="2026-11-15"&&!document.querySelector("dialog").open');
    await route('#/mail/' + messages[1].id);
    await click('a[href$="/agree"]');
    await check('all agree applies extension and moves starts only', 'EZ.record("r1").end==="2026-11-18"&&EZ.record("r3").start==="2026-11-19"&&EZ.record("r3").end==="2026-11-24"&&EZ.record("r4").start==="2026-11-19"&&EZ.state.mails.some(m=>m.type==="extension_applied"&&m.refs.loanId==="r1")');
    const eventCount = await evaluate('EZ.state.events.length');
    await route('#/mail/action/' + messages[1].token + '/agree');
    await check('agreement link does not duplicate state changes', 'EZ.state.events.length===' + eventCount);
  });
  await scenario('disagreement, daily nudges, return cancels request', async () => {
    await navigate(fileURL + '#/mail');
    await screenshot('mail');
    const requestMail = await evaluate('EZ.state.mails.find(m=>m.type==="extension_request")');
    await route('#/mail/' + requestMail.id);
    await click('a[href$="/disagree"]');
    await check('disagreement keeps due date and emails both contacts', 'EZ.record("r11").end==="2026-11-16"&&EZ.state.requests.find(r=>r.id===' + JSON.stringify(requestMail.refs.requestId) + ').status==="denied"&&EZ.state.mails.filter(m=>m.type==="communication"&&m.refs.requestId===' + JSON.stringify(requestMail.refs.requestId) + ').length===2');
    await navigate();
    await check('daily nudges address borrower and unanswered holder', 'EZ.state.mails.some(m=>m.type==="nudge_borrower")&&EZ.state.mails.some(m=>m.type==="nudge_holder")');
    await check('daily is idempotent for reminders and nudges', '(()=>{const n=EZ.state.mails.length;EZ.daily("2026-11-15");return n===EZ.state.mails.length})()');
    await check('return cancels outstanding extension request', '(()=>{EZ.returnQuantity("r11",2,"wu");const req=EZ.state.requests.find(r=>r.loanId==="r11"&&r.status==="cancelled");EZ.daily("2026-11-16");return !!req&&!EZ.state.mails.some(m=>m.date==="2026-11-16"&&m.refs.requestId===req.id&&m.type.startsWith("nudge"))})()');
  });
  await scenario('handover, receive, reject, partial remainder', async () => {
    await navigate(fileURL + '#/mail');
    const initial = await evaluate('EZ.state.mails.find(m=>m.type==="handover")');
    await route('#/mail/' + initial.id);
    await click('a[href$="/received"]');
    await check('receive without login records pickup and return, starts early', 'EZ.state.user===null&&EZ.held(EZ.record("r13"))===1&&EZ.held(EZ.record("r14"))===1&&EZ.pending(EZ.record("r14"))===1&&EZ.record("r14").start==="2026-11-15"&&EZ.record("r14").end==="2026-11-23"');
    await navigate(fileURL + '#/mail');
    const rejectMail = await evaluate('EZ.state.mails.find(m=>m.type==="handover")');
    await route('#/mail/' + rejectMail.id);
    await click('a[href$="/reject"]');
    await check('rejection leaves original held stock and sends email', 'EZ.held(EZ.record("r13"))===2&&EZ.state.mails.filter(m=>m.type==="handover_rejected").length===2');
    await navigate(fileURL + '#/mine');
    await login();
    await click('a[href="#/handover/r1"]');
    await check('handover defaults nearest recipient and reserved/held cap', 'document.querySelector("#recipient-r3").checked&&!document.querySelector("#recipient-r4").checked&&document.querySelector("#handover-r3").max==="2"');
    await fill('#handover-r3', 1);
    await click('#recipient-r4');
    await check('multiple recipients enabled within combined held cap', '!document.querySelector("#handover-submit").disabled');
    await fill('#handover-r4', 2);
    await check('combined handover cannot exceed held count', 'document.querySelector("#handover-submit").disabled');
    await fill('#handover-r4', 1);
    await click('#handover-submit');
    await check('handover sends one actionable email per recipient', 'EZ.state.handovers.filter(h=>h.loanId==="r1").length===2&&EZ.held(EZ.record("r1"))===2');
  });
  await scenario('email reminder actions and scheduler', async () => {
    await navigate(fileURL + '#/mail');
    const noNext = await evaluate('EZ.state.mails.find(m=>m.type==="reminder"&&m.refs.loanId==="r15")');
    await route('#/mail/' + noNext.id);
    await click('a[href$="/extend"]');
    await fill('#extend-days', 4);
    await click('#extend-form [type=submit]');
    await check('email one-click extension form works without login', 'EZ.state.user===null&&EZ.record("r15").end==="2026-11-19"');
    await navigate(fileURL + '#/mail');
    const next = await evaluate('EZ.state.mails.find(m=>m.type==="reminder"&&m.refs.loanId==="r1")');
    await route('#/mail/' + next.id);
    await click('a[href$="/handover"]');
    await check('reminder handover form opens without login', 'EZ.state.user===null&&!!document.querySelector("#handover-form")');
    await navigate();
    await check('overdue reminder names next borrower and email', 'EZ.state.mails.some(m=>m.type==="reminder"&&m.subject.startsWith("逾期")&&m.paragraphs.some(p=>p.includes("example.com")))');
    await check('auto-cancel only unpicked quantity on day after grace', '(()=>{EZ.daily("2026-11-16");const grace=EZ.pending(EZ.record("r7"))===2;EZ.daily("2026-11-17");return grace&&EZ.record("r7").status==="auto_cancelled"&&EZ.state.records.length===24&&EZ.state.mails.some(m=>m.type==="auto_cancel"&&m.refs.loanId==="r7")})()');
  });
  await scenario('QR, phones, print, keyboard', async () => {
    await navigate(fileURL + '#/qr');
    await check('every unit and item gets QR and simulated scan link', 'document.querySelectorAll(".qr-code svg").length===28&&document.querySelectorAll(".scan-link").length===28');
    await screenshot('qr');
    await evaluate('window.__printed=false;window.print=()=>{window.__printed=true}');
    await click('#print');
    await check('print control invokes print', 'window.__printed===true');
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    await check('print hides navigation and scan links', 'getComputedStyle(document.querySelector(".topbar")).display==="none"&&getComputedStyle(document.querySelector(".scan-link")).display==="none"');
    await screenshot('print');
    await send('Emulation.setEmulatedMedia', { media: '' });
    await click('.scan-link');
    await login();
    await viewport(390, 844);
    for (const hash of ['#/scan/unit/A1', '#/scan/item/number/borrow', '#/scan/unit/A1/pickup', '#/scan/unit/B1/return', '#/mine', '#/reschedule/r7', '#/extend/r1', '#/handover/r1', '#/mail', '#/qr']) {
      await route(hash);
      await check('phone overflow ' + hash, 'document.documentElement.scrollWidth<=innerWidth');
      if (hash === '#/scan/unit/A1') await screenshot('scan-mobile');
      if (hash === '#/scan/item/number/borrow') { await fill('#end-number', '2026-11-20'); await screenshot('borrow-mobile'); }
      if (hash === '#/mail') await screenshot('mail-mobile');
    }
    await route('#/room/1');
    await evaluate('[...document.querySelectorAll(".unit-tag")].find(tag=>tag.textContent==="A1").focus()');
    if (await evaluate('document.activeElement.getAttribute("aria-pressed")!=="true"')) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    }
    await check('keyboard precondition is selected native A1 button', 'document.activeElement.tagName==="BUTTON"&&document.activeElement.textContent==="A1"&&document.activeElement.getAttribute("aria-pressed")==="true"');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await check('keyboard can activate projected tag', 'document.querySelector(".room-unit-list")!==null');
    await click('#account');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await check('Escape closes account chooser', '!document.querySelector("dialog").open');
  });
  console.log('RUNTIME EXCEPTIONS', JSON.stringify(exceptions));
  if (exceptions.length) failures.push('Runtime exceptions: ' + exceptions.join('; '));
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('ALL BROWSER SCENARIOS PASSED');
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { socket?.close(); });
