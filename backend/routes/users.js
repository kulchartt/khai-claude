const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

router.get('/me/orders', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT o.*, STRING_AGG(p.title, ', ') as items
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/me/avatar', authMiddleware, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกรูปภาพ' });
      const result = await uploadToCloudinary(req.file.buffer, { folder: 'mueasong/avatars' });
      const avatarUrl = result.secure_url;
      await getDB().query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, req.user.id]);
      res.json({ avatar: avatarUrl, message: 'อัปเดตรูปโปรไฟล์แล้ว' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

router.get('/:id/products', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM products WHERE seller_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT id, name, avatar, rating, review_count, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
