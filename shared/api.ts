import createEngine from './engine.ts';
import { nextItemPosition } from './placement.ts';
import type { Catalog, Item, Snapshot, Unit, User, Receipt } from './model.ts';

export type Engine = ReturnType<typeof createEngine>;
// Express JSON and the demo's in-process calls share this untrusted boundary.
export type ApiBody = Record<string, unknown>;
const clone = structuredClone;
const randomUUID = () => globalThis.crypto.randomUUID();
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function text(value: unknown, label: string, max = 100, empty = false) {
  if (typeof value !== 'string' || value.trim().length > max || (!empty && !value.trim())) fail('請填寫有效的' + label + '。');
  return value.trim();
}
function integer(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(label + '須為 ' + min + ' 至 ' + max + ' 的整數。');
  return value;
}
function number(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(label + '超出允許範圍。');
  return value;
}
function email(input: unknown) {
  const value = text(input, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('請填寫有效的 Email。');
  return value;
}
function currentParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { today: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
function publicUser(user: User | null) { return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null; }
function view(snapshot: Snapshot, user: User | null, registrationEnabled: boolean, result?: Receipt) {
  const own = user && user.id;
  const data = clone(snapshot.data);
  data.people = data.people.map(person => person.id === own ? person : { id: person.id, name: person.name });
  const state = clone(snapshot.state);
  state.user = publicUser(user);
  state.mails = state.mails.filter(mail => mail.to === own);
  state.receipts = state.receipts.filter(receipt => receipt.userId === own);
  state.events = user && user.role === 'admin' ? state.events : [];
  state.requests = state.requests.filter(request => own && (state.records.find(record => record.id === request.loanId)?.userId === own || request.affected.some(answer => state.records.find(record => record.id === answer.recordId)?.userId === own)));
  state.handovers = state.handovers.filter(handover => own && [handover.loanId, handover.reservationId].some(id => state.records.find(record => record.id === id)?.userId === own));
  return { data, state, user: publicUser(user), registrationEnabled, revision: snapshot.revision, ...(result ? { result } : {}) };
}
function ownRecord(engine: Engine, id: unknown, user: User) {
  const record = engine.record(typeof id === "string" ? id : undefined);
  if (!record || record.userId !== user.id) fail('無法操作其他人的借用紀錄。', 403);
  return record;
}
function perform(engine: Engine, user: User, action: unknown, args: unknown) {
  if (!Array.isArray(args) || args.length > 5) fail('操作參數不正確。');
  let result;
  switch (action) {
    case 'makeBorrow': {
      const name = text(args[1], '姓名', 80);
      if (!Array.isArray(args[2]) || args[2].length < 1 || args[2].length > 100 || !['web', 'scan'].includes(args[3])) fail('借用內容不正確。');
      for (const selection of args[2]) if (!selection || typeof selection !== 'object') fail('借用內容不正確。');
      result = engine.makeBorrow(user.id, name, args[2], args[3]); break;
    }
    case 'pickup': ownRecord(engine, args[0], user); result = engine.pickup(args[0], user.id); break;
    case 'returnQuantity': ownRecord(engine, args[0], user); result = engine.returnQuantity(args[0], args[1], user.id); break;
    case 'cancelReservation': ownRecord(engine, args[0], user); result = engine.cancelReservation(args[0], user.id); break;
    case 'rescheduleReservation': ownRecord(engine, args[0], user); if (!args[1] || typeof args[1] !== 'object') fail('請填寫改期內容。'); result = engine.rescheduleReservation(args[0], args[1], user.id); break;
    case 'extend': ownRecord(engine, args[0], user); result = engine.extend(args[0], args[1]); break;
    case 'sendHandover': ownRecord(engine, args[0], user); if (!Array.isArray(args[1]) || args[1].length > 100 || args[1].some(allocation => !allocation || typeof allocation !== 'object')) fail('轉交內容不正確。'); result = engine.sendHandover(args[0], args[1]); break;
    case 'respondExtension': ownRecord(engine, args[1], user); if (typeof args[2] !== 'boolean') fail('請選擇同意或不同意。'); result = engine.respondExtension(args[0], args[1], args[2]); break;
    case 'respondHandover': {
      const handover = engine.state.handovers.find(entry => entry.id === args[0]);
      if (!handover) fail('找不到這筆轉交。', 404);
      ownRecord(engine, handover.reservationId, user); if (typeof args[1] !== 'boolean') fail('請確認收到或拒絕。'); result = engine.respondHandover(args[0], args[1]); break;
    }
    default: fail('不支援這個操作。');
  }
  if (result) result.userId = user.id;
  return result;
}
function validateUnit(unit: Unit, data: Catalog) {
  if (!data.rooms.some(room => room.id === unit.room)) fail('找不到房間。');
  if (!Object.hasOwn(data.types, unit.type)) fail('儲存處類型不正確。');
  unit.name = text(unit.name || data.types[unit.type], '儲存處名稱', 80);
  integer(unit.layers, unit.type === 'box' ? 0 : 1, unit.type === 'box' ? 0 : 10, '層數');
  for (const key of ['w', 'h', 'd'] as const) number(unit[key], .2, 4, '尺寸');
  number(unit.rotation, -Math.PI * 2, Math.PI * 2, '旋轉角度');
  number(unit.x, -5, 5, 'X 位置'); number(unit.z, -4, 4, 'Z 位置');
  const halfX = (Math.abs(Math.cos(unit.rotation)) * unit.w + Math.abs(Math.sin(unit.rotation)) * unit.d) / 2;
  const halfZ = (Math.abs(Math.sin(unit.rotation)) * unit.w + Math.abs(Math.cos(unit.rotation)) * unit.d) / 2;
  if (!unit.parent && (Math.abs(unit.x) + halfX > 5 + 1e-6 || Math.abs(unit.z) + halfZ > 4 + 1e-6)) fail('儲存處須放在房間範圍內。');
  if (unit.parent) {
    const parent = data.units.find(entry => entry.code === unit.parent && entry.room === unit.room && !entry.parent && ['cabinet', 'shelf'].includes(entry.type));
    if (!parent || unit.type !== 'box') fail('收納箱的上層儲存處不正確。');
    integer(unit.parentLayer, 1, parent.layers, '放置層');
  }
}

function validateItem(item: Item, data: Catalog) {
  const unit = data.units.find(entry => entry.code === item.unit); if (!unit) fail('找不到儲存處。');
  item.name = text(item.name, '物品名稱', 100);
  integer(item.total, 1, 100000, '總件數');
  integer(item.layer, unit.type === 'box' ? 0 : 1, unit.layers, '所在層');
  const assetNumber = item.assetNumber = text(item.assetNumber ?? '', '財產編號', 80, true);
  if (item.assetNumber && data.items.some(other => other.id !== item.id && other.assetNumber && other.assetNumber.toLowerCase() === assetNumber.toLowerCase())) fail('財產編號已使用，請輸入不重複的編號。', 409);
  if (item.x !== undefined) number(item.x, 0, 1, '物品 X 位置');
  if (item.y !== undefined) number(item.y, 0, 1, '物品 Y 位置');
}

export function changeCatalog(engine: Engine, method: string, path: string, body: ApiBody, user: User, revision: number) {
  if (body.revision !== undefined && body.revision !== revision) fail('資料已被其他人更新，請重新整理後再試。', 409);
  const [, , sectionName, encodedId] = path.split('/');
  const section = sectionName?.toLowerCase();
  const id = encodedId && decodeURIComponent(encodedId);
  const data = engine.data;
  mutateCatalog();
  engine.state.events.push({ id: randomUUID(), type: 'catalog_update', ref: path, date: data.today, details: { userId: user.id, method } });

  function mutateCatalog() {
    if (method === 'POST' && section === 'rooms' && !id) {
      data.rooms.push({ id: randomUUID(), name: text(body.name, '房間名稱', 80) });
      return;
    }
    if (method === 'PATCH' && section === 'rooms' && id) {
      const room = data.rooms.find(entry => entry.id === id); if (!room) fail('找不到這個房間。', 404);
      room.name = text(body.name, '房間名稱', 80);
      return;
    }

    if (method === 'POST' && section === 'units' && !id) {
      let next = 1;
      while (data.units.some(unit => unit.code === 'U' + next)) next++;
      const code = body.code === undefined ? 'U' + next : text(body.code, '位置編號', 32);
      if (!/^[A-Za-z0-9_-]+$/.test(code) || data.units.some(unit => unit.code === code)) fail('位置編號須為不重複的英數字、底線或連字號。');
      const unit = { code, room: body.room, type: body.type || 'shelf', layers: body.layers ?? 3, w: body.w ?? 1.5, h: body.h ?? 2, d: body.d ?? .8, x: body.x ?? 0, z: body.z ?? 0, rotation: body.rotation ?? 0, name: body.name } as Unit;
      if (unit.type === 'box') unit.layers = 0;
      validateUnit(unit, data); data.units.push(unit);
      return;
    }
    if (method === 'PATCH' && section === 'units' && id) {
      const unit = data.units.find(entry => entry.code === id); if (!unit) fail('找不到儲存處。', 404);
      const old = clone(unit);
      for (const key of ['name', 'room', 'type', 'layers', 'w', 'h', 'd', 'x', 'z', 'rotation'] as const) if (body[key] !== undefined) Object.assign(unit, { [key]: body[key] });
      if (unit.parent && ['x', 'z', 'rotation', 'room'].some(key => body[key] !== undefined)) fail('請移動收納箱所屬的儲存處。');
      if (unit.layers < old.layers && data.items.some(item => item.unit === unit.code && item.layer > unit.layers)) fail('請先移走受影響層的物品，再減少層數。');
      validateUnit(unit, data);
      data.items.filter(item => item.unit === unit.code).forEach(item => validateItem(item, data));
      const angle = unit.rotation - old.rotation;
      for (const child of data.units.filter(entry => entry.parent === unit.code)) {
        if (!['cabinet', 'shelf'].includes(unit.type)) fail('請先移走內部收納箱，再更改儲存處類型。');
        const dx = child.x - old.x, dz = child.z - old.z;
        child.x = unit.x + dx * Math.cos(angle) + dz * Math.sin(angle);
        child.z = unit.z - dx * Math.sin(angle) + dz * Math.cos(angle);
        child.rotation = ((child.rotation + angle + Math.PI * 2) % (Math.PI * 2)); child.room = unit.room;
        if (child.parentLayer! > unit.layers) fail('請先移走受影響層的收納箱。');
      }
      return;
    }

    if (method === 'POST' && section === 'items' && !id) {
      const layer = body.layer ?? 1;
      const position = nextItemPosition(data.items, body.unit as string, layer as number);
      const item = { code: '', id: randomUUID(), name: body.name, unit: body.unit, layer, total: body.total ?? 1, assetNumber: body.assetNumber ?? '', image: '', x: body.x ?? position.x, y: body.y ?? position.y } as Item;
      validateItem(item, data); item.code = item.unit + '-' + item.layer + '-' + item.id.slice(0, 6); data.items.push(item);
      return;
    }
    if (method === 'PATCH' && section === 'items' && id) {
      const item = data.items.find(entry => entry.id === id); if (!item) fail('找不到物品。', 404);
      const old = clone(item);
      for (const key of ['name', 'unit', 'layer', 'total', 'assetNumber', 'x', 'y'] as const) if (body[key] !== undefined) Object.assign(item, { [key]: body[key] });
      validateItem(item, data);
      if (item.total < old.total) {
        const last = engine.state.records.filter(record => record.itemId === item.id && (engine.held(record) || engine.pending(record))).reduce((day, record) => record.end > day ? record.end : day, engine.state.today);
        const requestedTotal = item.total; item.total = old.total;
        const committed = old.total - engine.capacity(item.id, engine.state.today, last); item.total = requestedTotal;
        if (item.total < committed) fail('總件數不能少於目前借出及預約的需求。');
      }
      if (item.unit !== old.unit || item.layer !== old.layer) item.code = item.unit + '-' + item.layer + '-' + item.id.slice(0, 6);
      return;
    }
    fail('找不到 API。', 404);
  }
}
function tokenMail(snapshot: Snapshot, token: string, now: Date) {
  const mail = snapshot.state.mails.find(entry => entry.token === token);
  if (!mail) fail('信件連結無效。', 404);
  if (mail.tokenExpires && now.getTime() > mail.tokenExpires) fail('信件連結已過期，請登入「我的信件」操作。', 410);
  return mail;
}
export function mailView(engine: Engine, snapshot: Snapshot, token: string, now: Date) {
  const mail = tokenMail(snapshot, token, now);
  const loan = engine.record(mail.refs.loanId);
  const candidates = loan && mail.actions.includes('handover') ? engine.futureReservations(loan).map(record => ({ recordId: record.id, name: record.name, quantity: engine.pending(record) })) : [];
  return { mail: { subject: mail.subject, paragraphs: mail.paragraphs, actions: mail.actions, used: !!mail.used, candidates, held: loan ? engine.held(loan) : 0 } };
}
export function respondToMail(engine: Engine, snapshot: Snapshot, token: string, body: ApiBody, now: Date, findUser: (id: string) => User | undefined) {
  const mail = tokenMail(snapshot, token, now);
  const user = findUser(mail.to);
  if (!user) fail('信件連結無效。', 404);
  if (mail.used) fail('這封信的操作已處理，請登入查看最新狀態。', 409);
  const action = body.action;
  if (typeof action !== "string" || !mail.actions.includes(action)) fail('這封信不支援此操作。', 403);
  let result;
  if (action === 'agree' || action === 'disagree') result = perform(engine, user, 'respondExtension', [mail.refs.requestId, mail.refs.reservationId, action === 'agree']);
  else if (action === 'received' || action === 'reject') result = perform(engine, user, 'respondHandover', [mail.refs.handoverId, action === 'received']);
  else if (action === 'extend') result = perform(engine, user, 'extend', [mail.refs.loanId, body.days]);
  else if (action === 'handover') result = perform(engine, user, 'sendHandover', [mail.refs.loanId, body.allocations]);
  else fail('不支援這個操作。');
  mail.used = true; return result;
}
export { currentParts, email, fail, perform, text, view };
