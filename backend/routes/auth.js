const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const { authMiddleware, SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว' });
    const db = getDB();
    const { rows: ex } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (ex[0]) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query('INSERT INTO users (name, email, password) VALUES ($1,$2,$3) RETURNING id', [name, email, hash]);
    const id = rows[0].id;
    const token = jwt.sign({ id, name, email }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, name, email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    const { rows } = await getDB().query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    if (user.is_banned) return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT id, name, email, avatar, rating, review_count, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
