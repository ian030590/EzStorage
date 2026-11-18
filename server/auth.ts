'use strict';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function password(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw Object.assign(new Error('密碼長度須為 12 至 128 個字元。'), { status: 400 });
  return value;
}
export function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(value, salt, 64).toString('hex');
}
export function verifyPassword(value: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(hash, 'hex'));
}
