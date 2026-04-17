const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

router.get('/me/orders', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT o.*,
        STRING_AGG(DISTINCT p.title, ', ') as items,
        MIN(p.seller_id) as seller_id,
        MIN(p.id) as product_id,
        MIN(p.image_url) as image_url,
        MIN(s.name) as seller_name,
        MIN(s.promptpay) as seller_promptpay,
        MIN(s.bank_name) as seller_bank_name,
        MIN(s.bank_account) as seller_bank_account,
        MIN(s.bank_account_name) as seller_bank_account_name
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users s ON p.seller_id = s.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/me/orders/:id/received', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    await db.query("UPDATE orders SET shipping_status = 'received', status = 'completed' WHERE id = $1", [req.params.id]);
    // Award points: 1 point per 10 baht
    try {
      const earnedPts = Math.floor(rows[0].total / 10);
      if (earnedPts > 0) {
        await db.query('UPDATE users SET points = points + $1 WHERE id = $2', [earnedPts, req.user.id]);
        await db.query("INSERT INTO points_log (user_id, points, reason) VALUES ($1,$2,$3)",
          [req.user.id, earnedPts, `ซื้อสินค้า ออเดอร์ #${String(req.params.id).padStart(4,'0')}`]);
      }
    } catch (ptsErr) { console.error('points award error:', ptsErr); }
    res.json({ message: 'ยืนยันรับสินค้าแล้ว ✅' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/promptpay', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query('SELECT promptpay FROM users WHERE id = $1', [req.user.id]);
    res.json({ promptpay: rows[0]?.promptpay || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/me/promptpay', authMiddleware, async (req, res) => {
  try {
    const { promptpay } = req.body;
    await getDB().query('UPDATE users SET promptpay = $1 WHERE id = $2', [promptpay || null, req.user.id]);
    res.json({ message: 'บันทึก PromptPay แล้ว ✅' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/seller-orders', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT o.id, o.total, o.status, o.slip_url, o.shipping_status, o.tracking_number, o.tracking_carrier,
        o.delivery_type, o.meetup_lat, o.meetup_lng, o.meetup_note, o.created_at,
        u.id as buyer_id, u.name as buyer_name, u.email as buyer_email,
        MIN(p.image_url) as image_url,
        STRING_AGG(p.title, ', ') as items
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON o.user_id = u.id
      WHERE p.seller_id = $1
      GROUP BY o.id, u.id, u.name, u.email
      ORDER BY o.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/analytics', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT p.id, p.title, p.price, p.status, p.view_count, p.image_url, p.created_at,
        COUNT(DISTINCT w.id)::int as wishlist_count,
        COUNT(DISTINCT o.id)::int as offer_count
      FROM products p
      LEFT JOIN wishlist_items w ON w.product_id = p.id
      LEFT JOIN offers o ON o.product_id = p.id
      WHERE p.seller_id = $1
      GROUP BY p.id
      ORDER BY p.view_count DESC NULLS LAST, p.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/points', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: u } = await db.query('SELECT points FROM users WHERE id = $1', [req.user.id]);
    const { rows: log } = await db.query(
      'SELECT points, reason, created_at FROM points_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ balance: u[0]?.points || 0, log });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/me/avatar', authMiddleware, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกรูปภาพ' });
      const result = await uploadToCloudinary(req.file.buffer, { folder: 'mueasong/avatars' });
      const avatarUrl = result.secure_url;
      await getDB().query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, req.user.id]);
      res.json({ avatar: avatarUrl, message: 'อัปเดตรูปโปรไฟล์แล้ว' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

router.get('/:id/products', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM products WHERE seller_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/me/bank', authMiddleware, async (req, res) => {
  try {
    const { bank_name, bank_account, bank_account_name } = req.body;
    await getDB().query(
      'UPDATE users SET bank_name = $1, bank_account = $2, bank_account_name = $3 WHERE id = $4',
      [bank_name || null, bank_account || null, bank_account_name || null, req.user.id]
    );
    res.json({ message: 'บันทึกข้อมูลบัญชีธนาคารแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT o.id, o.total, o.created_at, u.name as buyer_name,
         STRING_AGG(p.title, ', ') as items
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       JOIN users u ON o.user_id = u.id
       WHERE p.seller_id = $1 AND o.status = 'completed'
       GROUP BY o.id, u.name
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ensure verify_requests table exists (self-healing migration)
getDB().query(`CREATE TABLE IF NOT EXISTS verify_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  id_card_url TEXT DEFAULT NULL,
  status TEXT DEFAULT 'pending',
  admin_note TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
)`).catch(e => console.error('verify_requests table init error:', e.message));

// Verify request — user ส่งคำขอ (JSON only, ไม่มี file upload)
router.post('/me/verify-request', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'กรุณาระบุเหตุผล' });
    const { rows: existing } = await db.query(
      "SELECT * FROM verify_requests WHERE user_id = $1 AND status = 'pending'", [req.user.id]
    );
    if (existing.length) return res.status(400).json({ error: 'คุณมีคำขอที่รอพิจารณาอยู่แล้ว' });
    await db.query(
      "INSERT INTO verify_requests (user_id, reason) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET reason=$2, id_card_url=NULL, status='pending', admin_note=NULL, created_at=NOW()",
      [req.user.id, reason]
    );
    res.json({ message: 'ส่งคำขอยืนยันตัวตนแล้ว ⏳ รอ admin พิจารณา' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/me/name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อ' });
    await getDB().query('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), req.user.id]);
    res.json({ message: 'อัปเดตชื่อแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me/verify-request', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM verify_requests WHERE user_id = $1', [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT id, name, avatar, rating, review_count, created_at,
              shop_name, shop_bio, shop_banner, buyer_rating, buyer_review_count,
              is_verified, bank_name, bank_account, bank_account_name
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
