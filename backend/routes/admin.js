const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

router.use(authMiddleware);

router.get('/stats', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const queries = [
      db.query('SELECT COUNT(*) as c FROM users'),
      db.query('SELECT COUNT(*) as c FROM products'),
      db.query("SELECT COUNT(*) as c FROM products WHERE status='available'"),
      db.query("SELECT COUNT(*) as c FROM products WHERE status='sold'"),
      db.query('SELECT COUNT(*) as c FROM orders'),
      db.query('SELECT SUM(total) as s FROM orders'),
    ];
    const results = await Promise.all(queries);
    res.json({
      users: parseInt(results[0].rows[0].c),
      products: parseInt(results[1].rows[0].c),
      available: parseInt(results[2].rows[0].c),
      sold: parseInt(results[3].rows[0].c),
      orders: parseInt(results[4].rows[0].c),
      revenue: results[5].rows[0].s || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', adminOnly, async (req, res) => {
  try {
    const { q } = req.query;
    let sql = 'SELECT id, name, email, rating, review_count, is_admin, is_banned, created_at FROM users';
    const params = [];
    if (q) { sql += ' WHERE name ILIKE $1 OR email ILIKE $2'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await getDB().query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/users/:id/ban', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const { rows: ur } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const user = ur[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (user.is_admin) return res.status(400).json({ error: 'ไม่สามารถ ban admin ได้' });
    await db.query('UPDATE users SET is_banned = $1 WHERE id = $2', [user.is_banned ? 0 : 1, req.params.id]);
    res.json({ message: user.is_banned ? 'ปลดแบนแล้ว' : 'แบนผู้ใช้แล้ว', banned: !user.is_banned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/products', adminOnly, async (req, res) => {
  try {
    const { q, status } = req.query;
    let sql = 'SELECT p.*, u.name as seller_name FROM products p JOIN users u ON p.seller_id = u.id';
    const params = [];
    const where = [];
    let n = 0;
    if (q) { where.push(`(p.title ILIKE $${++n} OR u.name ILIKE $${++n})`); params.push(`%${q}%`, `%${q}%`); }
    if (status) { where.push(`p.status = $${++n}`); params.push(status); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY p.created_at DESC';
    const { rows } = await getDB().query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/products/:id', adminOnly, async (req, res) => {
  try {
    await getDB().query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ message: 'ลบสินค้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/products/:id/status', adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    await getDB().query('UPDATE products SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ message: 'อัปเดตสถานะแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
