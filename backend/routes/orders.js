const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

// POST /api/orders/buy-now — ซื้อทันที 1 ชิ้น (มือสอง)
router.post('/buy-now', authMiddleware, async (req, res) => {
  const db = getDB();
  const client = await db.connect();
  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: 'ระบุสินค้าด้วย' });
    await client.query('BEGIN');
    const { rows: pr } = await client.query(
      "SELECT p.*, COALESCE(u.shop_name, u.name) as seller_name, u.promptpay, u.bank_name, u.bank_account, u.bank_account_name FROM products p JOIN users u ON u.id = p.seller_id WHERE p.id = $1 AND p.status = 'available'",
      [product_id]
    );
    if (!pr[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบสินค้าหรือสินค้าถูกขายแล้ว' }); }
    const p = pr[0];
    if (Number(p.seller_id) === Number(req.user.id)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'ไม่สามารถซื้อสินค้าของตัวเองได้' }); }
    // ตรวจ soft lock ของคนอื่น
    if (p.cart_locked_until && new Date(p.cart_locked_until) > new Date() && Number(p.cart_locked_by) !== Number(req.user.id)) {
      const remaining = Math.ceil((new Date(p.cart_locked_until) - new Date()) / 60000);
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `สินค้านี้กำลังถูกจองชั่วคราว (อีกประมาณ ${remaining} นาที)` });
    }
    const { rows: or } = await client.query(
      "INSERT INTO orders (user_id, total, status) VALUES ($1,$2,'awaiting_payment') RETURNING id",
      [req.user.id, p.price]
    );
    const orderId = or[0].id;
    await client.query('INSERT INTO order_items (order_id, product_id, price, qty) VALUES ($1,$2,$3,1)', [orderId, p.id, p.price]);
    await client.query("UPDATE products SET status = 'reserved', cart_locked_until = NULL, cart_locked_by = NULL WHERE id = $1", [p.id]);
    // ลบออกจากตะกร้า (ถ้ามี)
    await client.query('DELETE FROM cart_items WHERE product_id = $1', [p.id]);
    await client.query('COMMIT');
    res.json({
      message: 'สร้างคำสั่งซื้อแล้ว',
      order_id: orderId,
      total: p.price,
      seller_promptpay: p.promptpay || null,
      seller_name: p.seller_name || '',
      seller_bank_name: p.bank_name || null,
      seller_bank_account: p.bank_account || null,
      seller_bank_account_name: p.bank_account_name || null,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/orders/:id/slip — ผู้ซื้ออัปโหลด slip
router.post('/:id/slip', authMiddleware, (req, res) => {
  upload.single('slip')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const db = getDB();
      const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      if (!or[0]) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
      if (!req.file) return res.status(400).json({ error: 'กรุณาแนบรูป slip' });
      const result = await uploadToCloudinary(req.file.buffer, { folder: 'mueasong/slips' });
      await db.query("UPDATE orders SET slip_url = $1, status = 'awaiting_confirmation' WHERE id = $2", [result.secure_url, req.params.id]);

      // แจ้งเตือนผู้ขาย
      const { rows: items } = await db.query(`
        SELECT DISTINCT p.seller_id FROM order_items oi
        JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1
      `, [req.params.id]);
      const io = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      for (const { seller_id } of items) {
        await db.query("INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'order','มี slip การโอนเงิน',$2)",
          [seller_id, `ออเดอร์ #${String(req.params.id).padStart(4,'0')} — รอการยืนยัน`]);
        const sock = onlineUsers?.get(seller_id);
        if (sock) io?.to(sock).emit('notification', { type: 'order' });
      }

      res.json({ message: 'ส่ง slip แล้ว รอผู้ขายยืนยัน ✅' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// PATCH /api/orders/:id/cancel — ผู้ซื้อยกเลิกคำสั่งซื้อ (เฉพาะตอนยังไม่ได้ส่ง slip)
router.patch('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const order = or[0];
    if (!order) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    if (!['awaiting_payment', 'pending'].includes(order.status)) {
      if (order.status === 'awaiting_confirmation') {
        return res.status(400).json({ error: 'ไม่สามารถยกเลิกได้ เนื่องจากส่ง slip ไปแล้ว กรุณาติดต่อผู้ขายเพื่อขอเงินคืน' });
      }
      return res.status(400).json({ error: 'ไม่สามารถยกเลิกได้ เนื่องจากผู้ขายยืนยันการชำระเงินแล้ว' });
    }
    // คืนสินค้ากลับมา available
    const { rows: items } = await db.query(
      'SELECT product_id FROM order_items WHERE order_id = $1', [req.params.id]
    );
    for (const { product_id } of items) {
      await db.query("UPDATE products SET status = 'available' WHERE id = $1", [product_id]);
    }
    await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [req.params.id]);

    // แจ้งผู้ขาย
    const { rows: sellers } = await db.query(`
      SELECT DISTINCT p.seller_id FROM order_items oi
      JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1
    `, [req.params.id]);
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    for (const { seller_id } of sellers) {
      await db.query("INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'order','ผู้ซื้อยกเลิกคำสั่งซื้อ ❌',$2)",
        [seller_id, `ออเดอร์ #${String(req.params.id).padStart(4,'0')} ถูกยกเลิก — สินค้ากลับมาวางขายแล้ว`]);
      const sock = onlineUsers?.get(seller_id);
      if (sock) io?.to(sock).emit('notification', { type: 'order' });
    }

    res.json({ message: 'ยกเลิกคำสั่งซื้อแล้ว สินค้ากลับมาวางขายแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/orders/:id/confirm-payment — ผู้ขายยืนยันรับเงิน
router.patch('/:id/confirm-payment', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query(`
      SELECT DISTINCT p.seller_id FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE o.id = $1
    `, [req.params.id]);
    if (!rows.find(r => Number(r.seller_id) === Number(req.user.id))) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });

    const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!or[0]) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
    if (or[0].status !== 'awaiting_confirmation') return res.status(400).json({ error: 'ออเดอร์นี้ยังไม่ได้รับ slip หรือดำเนินการไปแล้ว' });

    await db.query("UPDATE orders SET status = 'confirmed' WHERE id = $1", [req.params.id]);
    // ตอนนี้ยืนยันแล้ว — เปลี่ยนสถานะสินค้าเป็น sold จริงๆ
    await db.query(`
      UPDATE products SET status = 'sold'
      WHERE id IN (SELECT product_id FROM order_items WHERE order_id = $1)
    `, [req.params.id]);

    // แจ้งเตือนผู้ซื้อ
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    await db.query("INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'order','ยืนยันการชำระเงินแล้ว 🎉',$2)",
      [or[0].user_id, `ออเดอร์ #${String(req.params.id).padStart(4,'0')} — ผู้ขายยืนยันรับเงินแล้ว จะจัดส่งเร็วๆ นี้`]);
    const sock = onlineUsers?.get(or[0].user_id);
    if (sock) io?.to(sock).emit('notification', { type: 'order' });

    res.json({ message: 'ยืนยันรับชำระเงินแล้ว ✅ กรุณาจัดส่งสินค้าให้ผู้ซื้อ' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/orders/:id/seller-cancel — ผู้ขายยกเลิกออเดอร์ (ตกลงคืนเงินกันเอง)
router.patch('/:id/seller-cancel', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: sellers } = await db.query(`
      SELECT DISTINCT p.seller_id FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id WHERE o.id = $1
    `, [req.params.id]);
    if (!sellers.find(r => Number(r.seller_id) === Number(req.user.id))) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });

    const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = or[0];
    if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
    if (order.status === 'completed') return res.status(400).json({ error: 'ออเดอร์เสร็จสิ้นแล้ว ไม่สามารถยกเลิกได้' });

    // คืนสินค้ากลับมา available
    const { rows: items } = await db.query('SELECT product_id FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const { product_id } of items) {
      await db.query("UPDATE products SET status = 'available' WHERE id = $1", [product_id]);
    }
    await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [req.params.id]);

    // แจ้งผู้ซื้อ
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    await db.query("INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'order','ผู้ขายยกเลิกออเดอร์ ❌',$2)",
      [order.user_id, `ออเดอร์ #${String(req.params.id).padStart(4,'0')} ถูกยกเลิกโดยผู้ขาย — กรุณาติดต่อผู้ขายเพื่อรับเงินคืน`]);
    const sock = onlineUsers?.get(order.user_id);
    if (sock) io?.to(sock).emit('notification', { type: 'order' });

    res.json({ message: 'ยกเลิกออเดอร์แล้ว สินค้ากลับมาวางขายแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/orders/:id/ship — ผู้ขายอัพเดทสถานะการจัดส่ง
router.patch('/:id/ship', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { shipping_status, tracking_number, tracking_carrier } = req.body; // 'preparing' | 'shipped'
    if (!['preparing', 'shipped'].includes(shipping_status)) {
      return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    }
    // ตรวจสิทธิ์ — ต้องเป็นผู้ขายในออเดอร์นี้
    const { rows } = await db.query(`
      SELECT DISTINCT p.seller_id FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE o.id = $1
    `, [req.params.id]);
    if (!rows.find(r => Number(r.seller_id) === Number(req.user.id))) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });

    const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!or[0]) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
    if (or[0].status !== 'confirmed') return res.status(400).json({ error: 'ยังไม่ได้ยืนยันการชำระเงิน' });

    if (tracking_number !== undefined) {
      await db.query('UPDATE orders SET shipping_status = $1, tracking_number = $2, tracking_carrier = $3 WHERE id = $4',
        [shipping_status, tracking_number || null, tracking_carrier || null, req.params.id]);
    } else {
      await db.query('UPDATE orders SET shipping_status = $1 WHERE id = $2', [shipping_status, req.params.id]);
    }

    // แจ้งเตือนผู้ซื้อ
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    const label = shipping_status === 'shipped' ? 'ผู้ขายส่งพัสดุแล้ว 🚚' : 'ผู้ขายกำลังเตรียมของ 📦';
    const trackingNote = (shipping_status === 'shipped' && tracking_number) ? ` เลข Tracking: ${tracking_number}${tracking_carrier ? ` (${tracking_carrier})` : ''}` : '';
    const body = shipping_status === 'shipped'
      ? `ออเดอร์ #${String(req.params.id).padStart(4,'0')} — พัสดุถูกส่งแล้ว${trackingNote} กรุณารอรับสินค้า`
      : `ออเดอร์ #${String(req.params.id).padStart(4,'0')} — ผู้ขายกำลังเตรียมของ`;
    await db.query("INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'order',$2,$3)",
      [or[0].user_id, label, body]);
    const sock = onlineUsers?.get(or[0].user_id);
    if (sock) io?.to(sock).emit('notification', { type: 'order' });

    const msg = shipping_status === 'shipped' ? 'อัพเดทแล้ว: ส่งพัสดุแล้ว 🚚' : 'อัพเดทแล้ว: กำลังเตรียมของ 📦';
    res.json({ message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
