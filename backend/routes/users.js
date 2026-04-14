const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/:id/products', (req, res) => {
  const db = getDB();
  const products = db.prepare(`
    SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC
  `).all(req.params.id);
  res.json(products);
});

router.get('/me/orders', authMiddleware, (req, res) => {
  const db = getDB();
  const orders = db.prepare(`
    SELECT o.*, GROUP_CONCAT(p.title, ', ') as items
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN products p ON oi.product_id = p.id
    WHERE o.user_id = ?
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `).all(req.user.id);
  res.json(orders);
});

module.exports = router;
