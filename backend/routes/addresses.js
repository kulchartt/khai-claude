const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/addresses — get user's addresses
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/addresses — create address
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { label, recipient_name, phone, address, province } = req.body;
    if (!recipient_name || !phone || !address || !province) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    const db = getDB();
    // Check if this is the first address
    const { rows: existing } = await db.query(
      'SELECT COUNT(*) as c FROM addresses WHERE user_id = $1',
      [req.user.id]
    );
    const isFirst = parseInt(existing[0].c) === 0;

    const { rows } = await db.query(
      `INSERT INTO addresses (user_id, label, recipient_name, phone, address, province, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, label || 'บ้าน', recipient_name, phone, address, province, isFirst ? 1 : 0]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/addresses/:id — update address fields
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: ar } = await db.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!ar[0]) return res.status(404).json({ error: 'ไม่พบที่อยู่' });

    const { label, recipient_name, phone, address, province } = req.body;
    const existing = ar[0];
    await db.query(
      `UPDATE addresses SET label=$1, recipient_name=$2, phone=$3, address=$4, province=$5
       WHERE id = $6`,
      [
        label !== undefined ? label : existing.label,
        recipient_name !== undefined ? recipient_name : existing.recipient_name,
        phone !== undefined ? phone : existing.phone,
        address !== undefined ? address : existing.address,
        province !== undefined ? province : existing.province,
        req.params.id
      ]
    );
    res.json({ message: 'อัปเดตที่อยู่แล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/addresses/:id/default — set as default
router.patch('/:id/default', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: ar } = await db.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!ar[0]) return res.status(404).json({ error: 'ไม่พบที่อยู่' });

    await db.query('UPDATE addresses SET is_default = 0 WHERE user_id = $1', [req.user.id]);
    await db.query('UPDATE addresses SET is_default = 1 WHERE id = $1', [req.params.id]);
    res.json({ message: 'ตั้งเป็นที่อยู่หลักแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/addresses/:id — delete address
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: ar } = await db.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!ar[0]) return res.status(404).json({ error: 'ไม่พบที่อยู่' });
    await db.query('DELETE FROM addresses WHERE id = $1', [req.params.id]);
    res.json({ message: 'ลบที่อยู่แล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
