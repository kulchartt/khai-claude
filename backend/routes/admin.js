const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

router.use(authMiddleware);

router.get('/stats', adminOnly, (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const products = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  const available = db.prepare("SELECT COUNT(*) as c FROM products WHERE status='available'").get().c;
  const sold = db.prepare("SELECT COUNT(*) as c FROM products WHERE status='sold'").get().c;
  const orders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const revenue = db.prepare('SELECT SUM(total) as s FROM orders').get().s || 0;
  res.json({ users, products, available, sold, orders, revenue });
});

router.get('/users', adminOnly, (req, res) => {
  const db = getDB();
  const { q } = req.query;
  let sql = 'SELECT id, name, email, rating, review_count, is_admin, is_banned, created_at FROM users';
  const params = [];
  if (q) { sql += ' WHERE name LIKE ? OR email LIKE ?'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.patch('/users/:id/ban', adminOnly, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (user.is_admin) return res.status(400).json({ error: 'ไม่สามารถ ban admin ได้' });
  db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(user.is_banned ? 0 : 1, req.params.id);
  res.json({ message: user.is_banned ? 'ปลดแบนแล้ว' : 'แบนผู้ใช้แล้ว', banned: !user.is_banned });
});

router.get('/products', adminOnly, (req, res) => {
  const db = getDB();
  const { q, status } = req.query;
  let sql = 'SELECT p.*, u.name as seller_name FROM products p JOIN users u ON p.seller_id = u.id';
  const params = [];
  const where = [];
  if (q) { where.push('(p.title LIKE ? OR u.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY p.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.delete('/products/:id', adminOnly, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ message: 'ลบสินค้าแล้ว' });
});

router.patch('/products/:id/status', adminOnly, (req, res) => {
  const { status } = req.body;
  const db = getDB();
  db.prepare('UPDATE products SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'อัปเดตสถานะแล้ว' });
});

module.exports = router;
