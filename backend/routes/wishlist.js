const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT w.id, p.id as product_id, p.title, p.price, p.category, p.image_url, p.condition, p.status
      FROM wishlist_items w JOIN products p ON w.product_id = p.id
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

module.exports = router;
