const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/saved-searches — get user's saved searches
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/saved-searches — create saved search
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { keyword, category, max_price } = req.body;
    const { rows } = await getDB().query(
      `INSERT INTO saved_searches (user_id, keyword, category, max_price)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, keyword || '', category || 'ทั้งหมด', max_price || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/saved-searches/:id — delete saved search
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: sr } = await db.query(
      'SELECT * FROM saved_searches WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!sr[0]) return res.status(404).json({ error: 'ไม่พบการค้นหาที่บันทึก' });
    await db.query('DELETE FROM saved_searches WHERE id = $1', [req.params.id]);
    res.json({ message: 'ลบการค้นหาที่บันทึกแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
