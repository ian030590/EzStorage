import type { ApiBody, view } from '../shared/api.ts';

export const demo = null;

export async function request<T = ReturnType<typeof view>>(path: string, method = 'GET', body?: ApiBody) {
  const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '連線失敗，請稍後再試。');
  return value as T;
}

export function qrSource(route: string): string | Promise<string> {
  return '/api/qr.svg?text=' + encodeURIComponent(location.href.split('#')[0] + route);
}
