const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Submit a report
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { product_id, reason, detail } = req.body;
    if (!product_id || !reason) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
    const db = getDB();
    await db.query(
      `INSERT INTO reports (product_id, reporter_id, reason, detail)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (product_id, reporter_id) DO UPDATE SET reason=$3, detail=$4, status='pending'`,
      [product_id, req.user.id, reason, detail || '']
    );
    res.json({ message: 'รายงานส่งแล้ว ขอบคุณที่ช่วยดูแลชุมชน 🙏' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// User: get own reports
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT r.id, r.reason, r.detail, r.status, r.created_at,
        p.title as product_title, p.id as product_id, p.image_url as product_image
      FROM reports r
      JOIN products p ON r.product_id = p.id
      WHERE r.reporter_id = $1
      ORDER BY r.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: get all reports
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    const db = getDB();
    const { rows } = await db.query(`
      SELECT r.*, p.title as product_title, u.name as reporter_name
      FROM reports r
      JOIN products p ON r.product_id = p.id
      JOIN users u ON r.reporter_id = u.id
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: update report status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    const db = getDB();
    await db.query('UPDATE reports SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
    res.json({ message: 'อัปเดตแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
