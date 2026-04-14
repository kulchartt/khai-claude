const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'muesong_secret_key_2025';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
}

module.exports = { authMiddleware, SECRET };
