const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

// POST /api/disputes — open dispute
router.post('/', authMiddleware, (req, res) => {
  evidenceUpload.single('evidence')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const { order_id, reason, detail } = req.body;
      if (!order_id || !reason) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
      }

      const db = getDB();

      // Validate: order must belong to user and not be cancelled
      const { rows: or } = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
      if (!or[0]) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });

      const order = or[0];
      // Check user is buyer or seller of this order
      const { rows: sellerCheck } = await db.query(
        `SELECT COUNT(*) as c FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1 AND p.seller_id = $2`,
        [order_id, req.user.id]
      );
      const isBuyer = order.user_id === req.user.id;
      const isSeller = parseInt(sellerCheck[0].c) > 0;
      if (!isBuyer && !isSeller) {
        return res.status(403).json({ error: 'คุณไม่มีส่วนเกี่ยวข้องกับคำสั่งซื้อนี้' });
      }
      if (order.status === 'cancelled') {
        return res.status(400).json({ error: 'ไม่สามารถร้องเรียนคำสั่งซื้อที่ยกเลิกแล้วได้' });
      }

      // Upload evidence image if provided
      let evidenceUrl = null;
      if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, { folder: 'mueasong/disputes' });
        evidenceUrl = result.secure_url;
      }

      const { rows } = await db.query(
        `INSERT INTO disputes (order_id, user_id, reason, detail, evidence_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [order_id, req.user.id, reason, detail || '', evidenceUrl]
      );
      const dispute = rows[0];

      // Notify the other party
      try {
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        const { rows: sellerRows } = await db.query(
          `SELECT DISTINCT p.seller_id FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = $1`,
          [order_id]
        );
        const otherPartyId = isBuyer ? sellerRows[0]?.seller_id : order.user_id;
        if (otherPartyId && otherPartyId !== req.user.id) {
          await db.query(
            "INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,'system','มีการร้องเรียนคำสั่งซื้อ',$2,$3)",
            [otherPartyId, `มีการเปิดเรื่องร้องเรียนสำหรับคำสั่งซื้อ #${order_id}`, `/orders`]
          );
          const sock = onlineUsers?.get(otherPartyId);
          if (sock) io?.to(sock).emit('notification', { type: 'system' });
        }

        // Notify admins
        const { rows: admins } = await db.query('SELECT id FROM users WHERE is_admin = 1');
        for (const admin of admins) {
          await db.query(
            "INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'system','เรื่องร้องเรียนใหม่',$2)",
            [admin.id, `คำสั่งซื้อ #${order_id}: ${reason}`]
          );
          const sock = onlineUsers?.get(admin.id);
          if (sock) io?.to(sock).emit('notification', { type: 'system' });
        }
      } catch (notifErr) { console.error('dispute notify error:', notifErr); }

      res.json(dispute);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// GET /api/disputes/me — get user's disputes with order info
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT d.*, o.total as order_total, o.status as order_status
       FROM disputes d
       JOIN orders o ON d.order_id = o.id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/disputes — get all disputes (admin only)
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    const { rows } = await getDB().query(
      `SELECT d.*, u.name as reporter_name, u.email as reporter_email,
              o.total as order_total, o.status as order_status
       FROM disputes d
       JOIN users u ON d.user_id = u.id
       JOIN orders o ON d.order_id = o.id
       ORDER BY d.created_at DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/disputes/:id — update status + admin_note (admin only)
router.patch('/admin/:id', authMiddleware, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    const { status, admin_note } = req.body;
    const db = getDB();
    const { rows: dr } = await db.query('SELECT * FROM disputes WHERE id = $1', [req.params.id]);
    if (!dr[0]) return res.status(404).json({ error: 'ไม่พบเรื่องร้องเรียน' });
    await db.query(
      'UPDATE disputes SET status = COALESCE($1, status), admin_note = COALESCE($2, admin_note) WHERE id = $3',
      [status || null, admin_note || null, req.params.id]
    );
    res.json({ message: 'อัปเดตเรื่องร้องเรียนแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
