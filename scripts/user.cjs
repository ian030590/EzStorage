'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { password, hashPassword } = require('../server/auth');
const [action, address, name] = process.argv.slice(2);
try {
  if (!['create', 'reset'].includes(action) || !address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) throw new Error('用法：node scripts/user.cjs create EMAIL NAME 或 reset EMAIL；以 EZSTORAGE_USER_PASSWORD 環境變數傳入密碼。');
  if (action === 'create' && (!name?.trim() || name.length > 80)) throw new Error('請填寫 1 至 80 字元的姓名。');
  const secret = hashPassword(password(process.env.EZSTORAGE_USER_PASSWORD));
  const db = new DatabaseSync(process.env.DATABASE_PATH || path.join(__dirname, '../data/ezstorage.sqlite'));
  db.exec('PRAGMA busy_timeout=5000;');
  const email = address.trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (action === 'create') {
      if (user) throw new Error('此 Email 已註冊。');
      db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(randomUUID(), email, name.trim(), secret, 'borrower');
    } else {
      if (!user) throw new Error('找不到這個帳號。');
      db.prepare('UPDATE users SET password=? WHERE id=?').run(secret, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  db.close(); console.log(action === 'create' ? '借用人帳號已建立。' : '密碼已重設，舊登入已失效。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
