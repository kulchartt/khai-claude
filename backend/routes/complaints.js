const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/complaints — submit complaint (no auth required)
router.post('/', async (req, res) => {
  try {
    const { type, detail, contact, user_id } = req.body;
    if (!type || !detail) return res.status(400).json({ error: 'กรุณากรอกประเภทและรายละเอียด' });
    await getDB().query(
      `INSERT INTO complaints (type, detail, contact, user_id) VALUES ($1,$2,$3,$4)`,
      [type, detail, contact || null, user_id || null]
    );
    res.json({ ok: true, message: 'รับเรื่องร้องเรียนแล้ว ทีมงานจะดำเนินการภายใน 24 ชั่วโมง' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/complaints/my — user's own complaints
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT id, type, detail, contact, status, created_at FROM complaints WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/complaints — admin only
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: adminCheck } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (!adminCheck[0]?.is_admin) return res.status(403).json({ error: 'Admin only' });
    const { status } = req.query;
    const where = status ? `WHERE c.status = $1` : '';
    const params = status ? [status] : [];
    const { rows } = await db.query(`
      SELECT c.*, u.name as user_name, u.email as user_email
      FROM complaints c
      LEFT JOIN users u ON c.user_id = u.id
      ${where}
      ORDER BY c.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/complaints/:id — update status (admin only)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: adminCheck } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (!adminCheck[0]?.is_admin) return res.status(403).json({ error: 'Admin only' });
    const { status } = req.body;
    await db.query(`UPDATE complaints SET status=$1 WHERE id=$2`, [status, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
