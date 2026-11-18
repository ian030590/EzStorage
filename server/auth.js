'use strict';
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw Object.assign(new Error('密碼長度須為 12 至 128 個字元。'), { status: 400 });
  return value;
}
function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(value, salt, 64).toString('hex');
}
function verifyPassword(value, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(hash, 'hex'));
}
module.exports = { password, hashPassword, verifyPassword };
