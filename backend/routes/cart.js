const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    // Renew soft locks for this user's cart every time they open cart
    await db.query(`
      UPDATE products SET cart_locked_until = NOW() + INTERVAL '15 minutes', cart_locked_by = $1
      WHERE id IN (SELECT product_id FROM cart_items WHERE user_id = $1) AND status = 'available'
    `, [req.user.id]);
    const { rows } = await db.query(`
      SELECT c.id, c.qty, p.id as product_id, p.title, p.price, p.category, p.image_url, p.condition, p.status, p.cart_locked_until, p.cart_locked_by
      FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.user_id = $1
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/add', authMiddleware, async (req, res) => {
  try {
    const { product_id, qty = 1 } = req.body;
    if (!product_id) return res.status(400).json({ error: 'ระบุสินค้าด้วย' });
    const db = getDB();
    const { rows: pr } = await db.query("SELECT * FROM products WHERE id = $1 AND status = 'available'", [product_id]);
    if (!pr[0]) return res.status(404).json({ error: 'ไม่พบสินค้าหรือสินค้าถูกขายแล้ว' });
    // ตรวจ soft lock: ถ้าคนอื่นจองอยู่และยังไม่หมดเวลา
    if (pr[0].cart_locked_until && new Date(pr[0].cart_locked_until) > new Date() && Number(pr[0].cart_locked_by) !== Number(req.user.id)) {
      const remaining = Math.ceil((new Date(pr[0].cart_locked_until) - new Date()) / 60000);
      return res.status(409).json({ error: `สินค้านี้กำลังถูกจองชั่วคราว (อีกประมาณ ${remaining} นาที)` });
    }
    // สินค้ามือสอง = 1 ชิ้นต่อรายการ ถ้ามีในตะกร้าแล้วให้แจ้งแทน
    const { rows: existing } = await db.query(
      'SELECT id FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [req.user.id, product_id]
    );
    if (existing.length) return res.status(400).json({ error: 'สินค้านี้อยู่ในตะกร้าแล้ว' });
    await db.query(
      'INSERT INTO cart_items (user_id, product_id, qty) VALUES ($1,$2,1)',
      [req.user.id, product_id]
    );
    // ตั้ง soft lock 15 นาที
    await db.query(
      "UPDATE products SET cart_locked_until = NOW() + INTERVAL '15 minutes', cart_locked_by = $1 WHERE id = $2",
      [req.user.id, product_id]
    );
    res.json({ message: 'เพิ่มลงตะกร้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/qty', authMiddleware, async (req, res) => {
  try {
    const { product_id, qty } = req.body;
    const db = getDB();
    if (qty > 1) return res.status(400).json({ error: 'สินค้ามือสองมีได้ 1 ชิ้นต่อรายการ' });
    if (qty <= 0) {
      await db.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user.id, product_id]);
      await db.query('UPDATE products SET cart_locked_until = NULL, cart_locked_by = NULL WHERE id = $1 AND cart_locked_by = $2', [product_id, req.user.id]);
    } else {
      await db.query('UPDATE cart_items SET qty = $1 WHERE user_id = $2 AND product_id = $3', [qty, req.user.id, product_id]);
    }
    res.json({ message: 'อัปเดตตะกร้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:product_id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    await db.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.product_id]);
    // คืน soft lock เมื่อเอาสินค้าออกจากตะกร้า
    await db.query('UPDATE products SET cart_locked_until = NULL, cart_locked_by = NULL WHERE id = $1 AND cart_locked_by = $2', [req.params.product_id, req.user.id]);
    res.json({ message: 'ลบออกจากตะกร้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/checkout', authMiddleware, async (req, res) => {
  const db = getDB();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: items } = await client.query(`
      SELECT c.qty, p.id as product_id, p.price, p.status, p.seller_id
      FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.user_id = $1
    `, [req.user.id]);
    if (!items.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'ตะกร้าว่างเปล่า' }); }
    const unavailable = items.filter(i => i.status !== 'available');
    if (unavailable.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'สินค้าบางรายการถูกขายไปแล้ว' }); }
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const { rows: or } = await client.query("INSERT INTO orders (user_id, total, status) VALUES ($1,$2,'awaiting_payment') RETURNING id", [req.user.id, total]);
    const orderId = or[0].id;
    for (const item of items) {
      await client.query('INSERT INTO order_items (order_id, product_id, price, qty) VALUES ($1,$2,$3,$4)', [orderId, item.product_id, item.price, item.qty]);
      await client.query("UPDATE products SET status = 'reserved' WHERE id = $1", [item.product_id]);
    }
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    // คืน soft lock (status เปลี่ยนเป็น reserved แล้ว แต่ cleanup ให้เรียบร้อย)
    for (const item of items) {
      await client.query('UPDATE products SET cart_locked_until = NULL, cart_locked_by = NULL WHERE id = $1', [item.product_id]);
    }
    await client.query('COMMIT');

    // ดึง PromptPay ของผู้ขาย (ใช้ seller แรกในออเดอร์)
    const sellerId = items[0].seller_id;
    const { rows: sr } = await db.query('SELECT promptpay, name, bank_name, bank_account, bank_account_name FROM users WHERE id = $1', [sellerId]);
    const sellerPromptpay = sr[0]?.promptpay || null;
    const sellerName = sr[0]?.name || '';
    const sellerBankName = sr[0]?.bank_name || null;
    const sellerBankAccount = sr[0]?.bank_account || null;
    const sellerBankAccountName = sr[0]?.bank_account_name || null;

    res.json({ message: 'สร้างคำสั่งซื้อแล้ว', order_id: orderId, total, seller_promptpay: sellerPromptpay, seller_name: sellerName, seller_bank_name: sellerBankName, seller_bank_account: sellerBankAccount, seller_bank_account_name: sellerBankAccountName });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
