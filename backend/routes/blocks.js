const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Self-healing migration
getDB().query(`CREATE TABLE IF NOT EXISTS blocked_users (
  id SERIAL PRIMARY KEY,
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
)`).catch(e => console.error('blocked_users table init error:', e.message));

// POST /api/blocks/:userId — block a user
router.post('/:userId', authMiddleware, async (req, res) => {
  try {
    const blockedId = Number(req.params.userId);
    if (blockedId === req.user.id) return res.status(400).json({ error: 'ไม่สามารถบล็อกตัวเองได้' });
    await getDB().query(
      'INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, blockedId]
    );
    res.json({ message: 'บล็อกผู้ใช้แล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/blocks/:userId — unblock
router.delete('/:userId', authMiddleware, async (req, res) => {
  try {
    await getDB().query(
      'DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
      [req.user.id, Number(req.params.userId)]
    );
    res.json({ message: 'ยกเลิกการบล็อกแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/blocks/status/:userId — check if blocked (either direction)
router.get('/status/:userId', authMiddleware, async (req, res) => {
  try {
    const otherId = Number(req.params.userId);
    const { rows } = await getDB().query(
      `SELECT
        EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id=$1 AND blocked_id=$2) as i_blocked,
        EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id=$2 AND blocked_id=$1) as blocked_me`,
      [req.user.id, otherId]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/blocks — list users I blocked
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT u.id, u.name, u.avatar FROM blocked_users b
       JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
