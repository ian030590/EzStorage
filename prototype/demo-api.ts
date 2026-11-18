import qr from 'qrcode';
import seed from '../server/seed.json' with { type: 'json' };
import createEngine from '../shared/engine.ts';
import { changeCatalog, currentParts, email, fail, mailView, perform, respondToMail, text, view } from '../shared/api.ts';
import type { ApiBody } from '../shared/api.ts';
import type { Catalog, Receipt, Snapshot, User } from '../shared/model.ts';

const password = 'EzStorageDemo24';
const accounts = [
  { id: 'demo-admin', name: '示範管理者', email: 'admin@example.com', role: 'admin' },
  { id: 'demo-a', name: '示範使用者 A', email: 'user-a@example.com', role: 'borrower' },
  { id: 'demo-b', name: '示範使用者 B', email: 'user-b@example.com', role: 'borrower' },
];
export const credentials = accounts.map(user => user.email).join('、') + '（密碼：' + password + '）';

interface DemoUser extends User { passwordHash: string }
interface DemoSnapshot extends Snapshot { users: DemoUser[]; userId: string | null }

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function qrLink(pageURL: string, route: string) {
  const url = new URL(pageURL);
  url.hash = route;
  return url.href;
}

export function createDemoApi(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, basePath: string, now = () => new Date()) {
  const key = 'ezstorage-demo-v1:' + basePath;
  let seededHash: Promise<string> | undefined;
  let pending: Promise<unknown> = Promise.resolve();
  const withStorage = <T>(operation: () => T | Promise<T>) => {
    // Tabs share localStorage, so serialize read/modify/write with a browser lock when available.
    const locks = globalThis.navigator?.locks;
    if (locks) return locks.request(key, operation);
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };

  async function request(path: string, method = 'GET', body: ApiBody = {}) {
    const url = new URL(path, 'https://example.com');
    const route = url.pathname;
    if (method === 'GET' && route === '/api/qr.svg') {
      return qr.toString(text(url.searchParams.get('text'), 'QR Code 內容', 2048), { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    }
    if (method === 'GET' && route === '/api/health') return { status: 'ok' };
    const signIn = method === 'POST' && route === '/api/login';
    const register = method === 'POST' && route === '/api/register';
    let address: string | undefined, passwordHash: string | undefined;
    if (signIn || register) {
      address = email(body.email);
      if (typeof body.password !== 'string' || body.password.length < (register ? 12 : 0) || body.password.length > 128) {
        if (register) fail('密碼長度須為 12 至 128 個字元。');
        fail('帳號或密碼不正確。', 401);
      }
      passwordHash = await hash(body.password);
    }

    return withStorage(async () => {
      const stored = storage.getItem(key);
      const time = now();
      const { today, hour } = currentParts(time);
      let snapshot: DemoSnapshot;
      let changed = stored === null;
      if (stored === null) {
        const data: Catalog = { ...structuredClone(seed), today };
        const initialHash = await (seededHash ??= hash(password));
        data.rooms.forEach(room => { room.name = '示範｜' + room.name; });
        snapshot = {
          data, state: createEngine(data).state, lastDaily: null, revision: 0,
          users: accounts.map(user => ({ ...user, passwordHash: initialHash })), userId: accounts[0].id,
        };
      } else snapshot = JSON.parse(stored) as DemoSnapshot;

      snapshot.data.today = snapshot.state.today = today;
      snapshot.data.people = snapshot.users.map(({ id, name, email }) => ({ id, name, email }));
      const engine = createEngine(snapshot.data, snapshot.state, true);
      if (hour >= 8 && snapshot.lastDaily !== today) {
        engine.daily(today);
        snapshot.lastDaily = today;
        changed = true;
        snapshot.revision++;
      }

      let user = snapshot.users.find(entry => entry.id === snapshot.userId) ?? null;
      let result: Receipt | undefined;
      let response;
      const token = /^\/api\/mail-actions\/([^/]+)$/.exec(route)?.[1];
      if (signIn) {
        user = snapshot.users.find(entry => entry.email === address && entry.passwordHash === passwordHash) ?? null;
        if (!user) fail('帳號或密碼不正確。', 401);
        snapshot.userId = user.id;
      } else if (register) {
        const name = text(body.name, '姓名', 80);
        if (snapshot.users.some(entry => entry.email === address)) fail('這個 Email 已註冊。', 409);
        user = { id: crypto.randomUUID(), email: address!, name, role: 'borrower', passwordHash: passwordHash! };
        snapshot.users.push(user);
        snapshot.userId = user.id;
        snapshot.data.people.push({ id: user.id, name, email: user.email });
      } else if (method === 'POST' && route === '/api/logout') {
        snapshot.userId = user = null;
      } else if (method === 'POST' && route === '/api/actions') {
        if (!user) fail('請先登入。', 401);
        result = perform(engine, user, body.action, body.args);
        snapshot.revision++;
      } else if ((method === 'POST' || method === 'PATCH') && /^\/api\/(rooms|units|items)(\/[^/]+)?$/.test(route)) {
        if (!user) fail('請先登入。', 401);
        if (user.role !== 'admin') fail('只有管理者能編輯房間與物品。', 403);
        changeCatalog(engine, method, route, body, user, snapshot.revision);
        snapshot.revision++;
      } else if (token && method === 'GET') {
        response = mailView(engine, snapshot, decodeURIComponent(token), time);
      } else if (token && method === 'POST') {
        result = respondToMail(engine, snapshot, decodeURIComponent(token), body, time, id => snapshot.users.find(entry => entry.id === id));
        response = { result };
        snapshot.revision++;
      } else if (route !== '/api/state' || method !== 'GET') {
        fail('找不到 API。', 404);
      }

      if (changed || method !== 'GET') storage.setItem(key, JSON.stringify(snapshot));
      return response ?? view(snapshot, user, true, result);
    });
  }

  return { request, reset: () => withStorage(() => storage.removeItem(key)) };
}
