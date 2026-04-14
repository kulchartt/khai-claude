const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const items = db.prepare(`
    SELECT w.id, p.id as product_id, p.title, p.price, p.category, p.image_url, p.condition, p.status
    FROM wishlist_items w JOIN products p ON w.product_id = p.id
    WHERE w.user_id = ?
    ORDER BY w.added_at DESC
  `).all(req.user.id);
  res.json(items);
});

router.post('/toggle', authMiddleware, (req, res) => {
  const { product_id } = req.body;
  const db = getDB();
  const exists = db.prepare('SELECT id FROM wishlist_items WHERE user_id = ? AND product_id = ?').get(req.user.id, product_id);
  if (exists) {
    db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?').run(req.user.id, product_id);
    res.json({ liked: false, message: 'ลบออกจากรายการโปรดแล้ว' });
  } else {
    db.prepare('INSERT INTO wishlist_items (user_id, product_id) VALUES (?, ?)').run(req.user.id, product_id);
    res.json({ liked: true, message: 'เพิ่มในรายการโปรดแล้ว' });
  }
});

module.exports = router;
