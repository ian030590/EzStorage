import { createDemoApi, credentials, qrLink } from './demo-api.ts';

const api = createDemoApi(localStorage, new URL('.', location.href).pathname);
export const demo = { credentials, reset: api.reset };
export const request = api.request;

export async function qrSource(route: string) {
  const svg = await request('/api/qr.svg?text=' + encodeURIComponent(qrLink(location.href, route)));
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(svg));
}
