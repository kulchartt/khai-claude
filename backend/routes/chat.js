const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT r.*,
        p.title as product_title, p.image_url as product_image,
        buyer.name as buyer_name, seller.name as seller_name,
        (SELECT content FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_at,
        (SELECT COUNT(*) FROM messages WHERE room_id = r.id AND is_read = 0 AND sender_id != $1) as unread
      FROM chat_rooms r
      LEFT JOIN products p ON r.product_id = p.id
      JOIN users buyer ON r.buyer_id = buyer.id
      JOIN users seller ON r.seller_id = seller.id
      WHERE r.buyer_id = $2 OR r.seller_id = $3
      ORDER BY last_at DESC NULLS LAST
    `, [req.user.id, req.user.id, req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/room', authMiddleware, async (req, res) => {
  try {
    const { seller_id, product_id } = req.body;
    if (seller_id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถแชทกับตัวเองได้' });
    const db = getDB();
    const { rows: ex } = await db.query(
      'SELECT * FROM chat_rooms WHERE buyer_id = $1 AND seller_id = $2 AND product_id IS NOT DISTINCT FROM $3',
      [req.user.id, seller_id, product_id || null]
    );
    if (ex[0]) return res.json(ex[0]);
    const { rows } = await db.query(
      'INSERT INTO chat_rooms (buyer_id, seller_id, product_id) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, seller_id, product_id || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: rr } = await db.query('SELECT * FROM chat_rooms WHERE id = $1', [req.params.roomId]);
    const room = rr[0];
    if (!room || (room.buyer_id !== req.user.id && room.seller_id !== req.user.id)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    }
    await db.query('UPDATE messages SET is_read = 1 WHERE room_id = $1 AND sender_id != $2', [req.params.roomId, req.user.id]);
    const { rows: msgs } = await db.query(`
      SELECT m.*, u.name as sender_name FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.room_id = $1 ORDER BY m.created_at ASC
    `, [req.params.roomId]);
    res.json(msgs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
