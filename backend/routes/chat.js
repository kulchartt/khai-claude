const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');
const router = express.Router();

const chatImgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

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

// POST /api/chat/rooms/:roomId/image — ส่งรูปในแชท
router.post('/rooms/:roomId/image', authMiddleware, (req, res) => {
  chatImgUpload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const db = getDB();
      const { rows: rr } = await db.query('SELECT * FROM chat_rooms WHERE id = $1', [req.params.roomId]);
      const room = rr[0];
      if (!room || (room.buyer_id !== req.user.id && room.seller_id !== req.user.id)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
      }
      if (!req.file) return res.status(400).json({ error: 'กรุณาแนบรูปภาพ' });
      const result = await uploadToCloudinary(req.file.buffer, { folder: 'mueasong/chat' });
      const imageUrl = result.secure_url;
      const content = '__img__:' + imageUrl;
      const { rows: mr } = await db.query(
        'INSERT INTO messages (room_id, sender_id, content) VALUES ($1,$2,$3) RETURNING id',
        [req.params.roomId, req.user.id, content]
      );
      const { rows: fm } = await db.query(
        'SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1',
        [mr[0].id]
      );
      const fullMsg = fm[0];
      const io = req.app.get('io');
      if (io) io.to(parseInt(req.params.roomId)).emit('new_message', fullMsg);
      res.json(fullMsg);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

router.get('/unread', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT COUNT(*)::int as count
      FROM messages m
      JOIN chat_rooms r ON m.room_id = r.id
      WHERE (r.buyer_id = $1 OR r.seller_id = $1)
        AND m.sender_id != $1 AND m.is_read = 0
    `, [req.user.id]);
    res.json({ unread: rows[0].count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
