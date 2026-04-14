const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/product/:productId', (req, res) => {
  const db = getDB();
  const reviews = db.prepare(`
    SELECT r.*, u.name as reviewer_name FROM reviews r
    JOIN users u ON r.reviewer_id = u.id
    WHERE r.product_id = ? ORDER BY r.created_at DESC
  `).all(req.params.productId);
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0;
  res.json({ reviews, average: parseFloat(avg), count: reviews.length });
});

router.post('/', authMiddleware, (req, res) => {
  const { product_id, rating, comment } = req.body;
  if (!product_id || !rating) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'คะแนนต้องอยู่ระหว่าง 1-5' });
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  if (product.seller_id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถรีวิวสินค้าตัวเองได้' });

  try {
    db.prepare('INSERT INTO reviews (product_id, reviewer_id, seller_id, rating, comment) VALUES (?, ?, ?, ?, ?)').run(product_id, req.user.id, product.seller_id, rating, comment || '');
    const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE seller_id = ?').get(product.seller_id);
    db.prepare('UPDATE users SET rating = ?, review_count = ? WHERE id = ?').run(parseFloat(stats.avg.toFixed(1)), stats.cnt, product.seller_id);
    db.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'review', 'มีรีวิวใหม่', ?, ?)").run(product.seller_id, `ได้รับรีวิว ${rating} ดาว สำหรับ "${product.title}"`, `/product/${product_id}`);
    res.json({ message: 'รีวิวสำเร็จ!' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'คุณรีวิวสินค้านี้ไปแล้ว' });
    throw e;
  }
});

module.exports = router;
