const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const SECRET = process.env.JWT_SECRET || 'muesong_secret_key_2025';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = getDB().prepare('SELECT id, name, email, is_admin FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
    req.user = { ...payload, ...user };
    next();
  } catch {
    res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
}

module.exports = { authMiddleware, SECRET };
