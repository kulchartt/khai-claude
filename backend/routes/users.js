const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/:id/products', async (req, res) => {
  try {
    const { rows } = await getDB().query('SELECT * FROM products WHERE seller_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
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

module.exports = router;
