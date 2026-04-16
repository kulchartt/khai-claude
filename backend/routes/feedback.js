const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  next();
}

const router = express.Router();

// Self-healing table
getDB().query(`CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  sender_name TEXT DEFAULT NULL,
  sender_email TEXT DEFAULT NULL,
  is_read INTEGER DEFAULT 0,
  admin_note TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(e => console.error('feedback table init error:', e.message));

const CATEGORIES = ['bug','feature','complaint','review','keep','other'];

// POST /api/feedback — no auth required
router.post('/', async (req, res) => {
  try {
    const { category, message, sender_name, sender_email } = req.body;
    if (!category || !CATEGORIES.includes(category)) return res.status(400).json({ error: 'หมวดหมู่ไม่ถูกต้อง' });
    if (!message || message.trim().length < 5) return res.status(400).json({ error: 'กรุณาระบุข้อความอย่างน้อย 5 ตัวอักษร' });
    await getDB().query(
      'INSERT INTO feedback (category, message, sender_name, sender_email) VALUES ($1,$2,$3,$4)',
      [category, message.trim(), sender_name?.trim() || null, sender_email?.trim() || null]
    );
    res.json({ message: 'ขอบคุณสำหรับ Feedback! 🙏 ทีมงานจะนำไปปรับปรุงครับ' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/feedback/admin — admin only
router.get('/admin', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT * FROM feedback ORDER BY is_read ASC, created_at DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/feedback/admin/:id — mark read / add note
router.patch('/admin/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { is_read, admin_note } = req.body;
    await getDB().query(
      'UPDATE feedback SET is_read = COALESCE($1, is_read), admin_note = COALESCE($2, admin_note) WHERE id = $3',
      [is_read ?? null, admin_note ?? null, req.params.id]
    );
    res.json({ message: 'อัปเดตแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
