const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;
  res.json({ notifications: notifs, unread });
});

router.post('/read-all', authMiddleware, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'อ่านทั้งหมดแล้ว' });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ message: 'ลบแล้ว' });
});

module.exports = router;
