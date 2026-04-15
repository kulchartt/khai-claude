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
    if (!rows.find(r => r.seller_id === req.user.id)) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });

    const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!or[0]) return res.status(404).json({ error: 'ไม่พบออเดอร์' });

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

// PATCH /api/orders/:id/ship — ผู้ขายอัพเดทสถานะการจัดส่ง
router.patch('/:id/ship', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { shipping_status } = req.body; // 'preparing' | 'shipped'
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
    if (!rows.find(r => r.seller_id === req.user.id)) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });

    const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!or[0]) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
    if (or[0].status !== 'confirmed') return res.status(400).json({ error: 'ยังไม่ได้ยืนยันการชำระเงิน' });

    await db.query('UPDATE orders SET shipping_status = $1 WHERE id = $2', [shipping_status, req.params.id]);

    // แจ้งเตือนผู้ซื้อ
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    const label = shipping_status === 'shipped' ? 'ผู้ขายส่งพัสดุแล้ว 🚚' : 'ผู้ขายกำลังเตรียมของ 📦';
    const body = shipping_status === 'shipped'
      ? `ออเดอร์ #${String(req.params.id).padStart(4,'0')} — พัสดุถูกส่งแล้ว กรุณารอรับสินค้า`
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
