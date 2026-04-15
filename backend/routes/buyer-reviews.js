const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/buyer-reviews — seller reviews buyer after completed order
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { order_id, buyer_id, rating, comment } = req.body;
    if (!order_id || !buyer_id || !rating) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'คะแนนต้องอยู่ระหว่าง 1-5' });
    }

    const db = getDB();

    // Validate: order must exist and be completed
    const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (!or[0]) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    if (or[0].status !== 'completed') {
      return res.status(400).json({ error: 'คำสั่งซื้อยังไม่เสร็จสมบูรณ์' });
    }

    // Validate: reviewer must be a seller of items in this order
    const { rows: sellerCheck } = await db.query(
      `SELECT COUNT(*) as c FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1 AND p.seller_id = $2`,
      [order_id, req.user.id]
    );
    if (parseInt(sellerCheck[0].c) === 0) {
      return res.status(403).json({ error: 'คุณไม่ใช่ผู้ขายในคำสั่งซื้อนี้' });
    }

    // Insert review (UNIQUE constraint on order_id + reviewer_id will catch duplicates)
    await db.query(
      `INSERT INTO buyer_reviews (order_id, reviewer_id, buyer_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, req.user.id, buyer_id, rating, comment || '']
    );

    // Update buyer's rating and review_count
    const { rows: stats } = await db.query(
      'SELECT AVG(rating)::REAL as avg_r, COUNT(*) as cnt FROM buyer_reviews WHERE buyer_id = $1',
      [buyer_id]
    );
    await db.query(
      'UPDATE users SET buyer_rating = $1, buyer_review_count = $2 WHERE id = $3',
      [parseFloat(stats[0].avg_r).toFixed(1), parseInt(stats[0].cnt), buyer_id]
    );

    res.json({ message: 'รีวิวผู้ซื้อแล้ว' });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'คุณรีวิวคำสั่งซื้อนี้แล้ว' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/buyer-reviews/user/:userId — get reviews for a buyer
router.get('/user/:userId', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT br.*, u.name as reviewer_name, u.avatar as reviewer_avatar
       FROM buyer_reviews br
       JOIN users u ON br.reviewer_id = u.id
       WHERE br.buyer_id = $1
       ORDER BY br.created_at DESC`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
