const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const items = db.prepare(`
    SELECT c.id, c.qty, p.id as product_id, p.title, p.price, p.category, p.image_url, p.condition, p.status
    FROM cart_items c JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ?
  `).all(req.user.id);
  res.json(items);
});

router.post('/add', authMiddleware, (req, res) => {
  const { product_id, qty = 1 } = req.body;
  if (!product_id) return res.status(400).json({ error: 'ระบุสินค้าด้วย' });
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND status = "available"').get(product_id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้าหรือสินค้าถูกขายแล้ว' });

  db.prepare(`
    INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET qty = qty + excluded.qty
  `).run(req.user.id, product_id, qty);
  res.json({ message: 'เพิ่มลงตะกร้าแล้ว' });
});

router.put('/qty', authMiddleware, (req, res) => {
  const { product_id, qty } = req.body;
  const db = getDB();
  if (qty <= 0) {
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, product_id);
  } else {
    db.prepare('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?').run(qty, req.user.id, product_id);
  }
  res.json({ message: 'อัปเดตตะกร้าแล้ว' });
});

router.delete('/:product_id', authMiddleware, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.product_id);
  res.json({ message: 'ลบออกจากตะกร้าแล้ว' });
});

router.post('/checkout', authMiddleware, (req, res) => {
  const db = getDB();
  const items = db.prepare(`
    SELECT c.qty, p.id as product_id, p.price, p.status
    FROM cart_items c JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ?
  `).all(req.user.id);

  if (!items.length) return res.status(400).json({ error: 'ตะกร้าว่างเปล่า' });
  const unavailable = items.filter(i => i.status !== 'available');
  if (unavailable.length) return res.status(400).json({ error: 'สินค้าบางรายการถูกขายไปแล้ว' });

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const order = db.prepare('INSERT INTO orders (user_id, total) VALUES (?, ?)').run(req.user.id, total);

  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, price, qty) VALUES (?, ?, ?, ?)');
  const updateStatus = db.prepare('UPDATE products SET status = "sold" WHERE id = ?');
  for (const item of items) {
    insertItem.run(order.lastInsertRowid, item.product_id, item.price, item.qty);
    updateStatus.run(item.product_id);
  }
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'ชำระเงินสำเร็จ!', order_id: order.lastInsertRowid, total });
});

module.exports = router;
