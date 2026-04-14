const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/product/:productId', async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT r.*, u.name as reviewer_name FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.product_id = $1 ORDER BY r.created_at DESC
    `, [req.params.productId]);
    const avg = rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : 0;
    res.json({ reviews: rows, average: parseFloat(avg), count: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { product_id, rating, comment } = req.body;
    if (!product_id || !rating) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'คะแนนต้องอยู่ระหว่าง 1-5' });
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [product_id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถรีวิวสินค้าตัวเองได้' });
    await db.query(
      'INSERT INTO reviews (product_id, reviewer_id, seller_id, rating, comment) VALUES ($1,$2,$3,$4,$5)',
      [product_id, req.user.id, product.seller_id, rating, comment || '']
    );
    const { rows: stats } = await db.query('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE seller_id = $1', [product.seller_id]);
    await db.query('UPDATE users SET rating = $1, review_count = $2 WHERE id = $3', [parseFloat(parseFloat(stats[0].avg).toFixed(1)), parseInt(stats[0].cnt), product.seller_id]);
    await db.query("INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,'review','มีรีวิวใหม่',$2,$3)", [product.seller_id, `ได้รับรีวิว ${rating} ดาว สำหรับ "${product.title}"`, `/product/${product_id}`]);
    res.json({ message: 'รีวิวสำเร็จ!' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'คุณรีวิวสินค้านี้ไปแล้ว' });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
