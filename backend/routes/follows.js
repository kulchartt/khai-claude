const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// POST /api/follows/toggle — toggle follow/unfollow
router.post('/toggle', authMiddleware, async (req, res) => {
  try {
    const { seller_id } = req.body;
    if (!seller_id) return res.status(400).json({ error: 'กรุณาระบุ seller_id' });
    if (parseInt(seller_id) === req.user.id) return res.status(400).json({ error: 'ไม่สามารถติดตามตัวเองได้' });
    const db = getDB();
    const { rows: ex } = await db.query(
      'SELECT id FROM follows WHERE follower_id = $1 AND seller_id = $2',
      [req.user.id, seller_id]
    );
    if (ex.length) {
      await db.query('DELETE FROM follows WHERE follower_id = $1 AND seller_id = $2', [req.user.id, seller_id]);
      res.json({ following: false, message: 'เลิกติดตามแล้ว' });
    } else {
      await db.query('INSERT INTO follows (follower_id, seller_id) VALUES ($1,$2)', [req.user.id, seller_id]);
      // แจ้งเตือนผู้ขาย
      const { rows: me } = await db.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
      await db.query(
        "INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'system','มีคนติดตามคุณ ❤️',$2)",
        [seller_id, `${me[0]?.name || 'มีผู้ใช้'} เริ่มติดตามคุณแล้ว`]
      );
      const io = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      const sock = onlineUsers?.get(parseInt(seller_id));
      if (sock) io?.to(sock).emit('notification', { type: 'system' });
      res.json({ following: true, message: 'ติดตามแล้ว ❤️' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/follows — sellers I follow
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT f.seller_id, u.name, u.avatar, u.rating, u.review_count
      FROM follows f JOIN users u ON f.seller_id = u.id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/follows/count/:sellerId — follower count for a seller
router.get('/count/:sellerId', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT COUNT(*)::int as count FROM follows WHERE seller_id = $1',
      [req.params.sellerId]
    );
    res.json({ count: rows[0].count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/follows/status/:sellerId — am I following this seller?
router.get('/status/:sellerId', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT id FROM follows WHERE follower_id = $1 AND seller_id = $2',
      [req.user.id, req.params.sellerId]
    );
    res.json({ following: rows.length > 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
