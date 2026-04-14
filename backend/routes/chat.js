const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/rooms', authMiddleware, (req, res) => {
  const db = getDB();
  const rooms = db.prepare(`
    SELECT r.*,
      p.title as product_title, p.image_url as product_image,
      buyer.name as buyer_name, seller.name as seller_name,
      (SELECT content FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_at,
      (SELECT COUNT(*) FROM messages WHERE room_id = r.id AND is_read = 0 AND sender_id != ?) as unread
    FROM chat_rooms r
    LEFT JOIN products p ON r.product_id = p.id
    JOIN users buyer ON r.buyer_id = buyer.id
    JOIN users seller ON r.seller_id = seller.id
    WHERE r.buyer_id = ? OR r.seller_id = ?
    ORDER BY last_at DESC
  `).all(req.user.id, req.user.id, req.user.id);
  res.json(rooms);
});

router.post('/room', authMiddleware, (req, res) => {
  const { seller_id, product_id } = req.body;
  if (seller_id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถแชทกับตัวเองได้' });
  const db = getDB();
  let room = db.prepare('SELECT * FROM chat_rooms WHERE buyer_id = ? AND seller_id = ? AND product_id = ?').get(req.user.id, seller_id, product_id || null);
  if (!room) {
    const r = db.prepare('INSERT INTO chat_rooms (buyer_id, seller_id, product_id) VALUES (?, ?, ?)').run(req.user.id, seller_id, product_id || null);
    room = db.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(r.lastInsertRowid);
  }
  res.json(room);
});

router.get('/rooms/:roomId/messages', authMiddleware, (req, res) => {
  const db = getDB();
  const room = db.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(req.params.roomId);
  if (!room || (room.buyer_id !== req.user.id && room.seller_id !== req.user.id)) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  db.prepare('UPDATE messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?').run(req.params.roomId, req.user.id);
  const messages = db.prepare(`
    SELECT m.*, u.name as sender_name FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.room_id = ? ORDER BY m.created_at ASC
  `).all(req.params.roomId);
  res.json(messages);
});

module.exports = router;
