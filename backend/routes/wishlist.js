const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT p.id, p.title, p.price, p.original_price, p.flash_price,
             p.category, p.image_url, p.condition, p.status,
             p.location, p.created_at,
             COALESCE(u.shop_name, u.name) as seller_name
      FROM wishlist_items w
      JOIN products p ON w.product_id = p.id
      JOIN users u ON p.seller_id = u.id
      WHERE w.user_id = $1 ORDER BY w.added_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/toggle', authMiddleware, async (req, res) => {
  try {
    const { product_id } = req.body;
    const db = getDB();
    const { rows: ex } = await db.query('SELECT id FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, product_id]);
    if (ex[0]) {
      await db.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, product_id]);
      res.json({ liked: false, message: 'ลบออกจากรายการโปรดแล้ว' });
    } else {
      await db.query('INSERT INTO wishlist_items (user_id, product_id) VALUES ($1,$2)', [req.user.id, product_id]);
      res.json({ liked: true, message: 'เพิ่มในรายการโปรดแล้ว' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle via /:productId (used by frontend toggleWishlist)
router.post('/:productId', authMiddleware, async (req, res) => {
  try {
    const product_id = Number(req.params.productId);
    const db = getDB();
    const { rows: ex } = await db.query('SELECT id FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, product_id]);
    if (ex[0]) {
      await db.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, product_id]);
      res.json({ liked: false, message: 'ลบออกจากรายการโปรดแล้ว' });
    } else {
      await db.query('INSERT INTO wishlist_items (user_id, product_id) VALUES ($1,$2)', [req.user.id, product_id]);
      res.json({ liked: true, message: 'เพิ่มในรายการโปรดแล้ว' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
