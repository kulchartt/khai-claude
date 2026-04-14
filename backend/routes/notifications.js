const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: notifs } = await db.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    const { rows: ur } = await db.query('SELECT COUNT(*) as c FROM notifications WHERE user_id = $1 AND is_read = 0', [req.user.id]);
    res.json({ notifications: notifs, unread: parseInt(ur[0].c) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    await getDB().query('UPDATE notifications SET is_read = 1 WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'อ่านทั้งหมดแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await getDB().query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'ลบแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
