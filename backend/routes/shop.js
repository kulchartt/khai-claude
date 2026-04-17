const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

// GET /api/shop/:userId — public shop profile
router.get('/:userId', async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query(
      `SELECT id, name, avatar, rating, review_count, is_verified,
              shop_name, shop_bio, shop_banner, created_at,
              holiday_mode, holiday_message, holiday_until
       FROM users WHERE id = $1`,
      [req.params.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบร้านค้า' });
    const shop = rows[0];
    const { rows: tierRows } = await db.query(
      `SELECT COUNT(DISTINCT o.id)::int as sales FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE p.seller_id = $1 AND o.status = 'completed'`, [shop.id]
    );
    const sales = tierRows[0]?.sales || 0;
    shop.sales_count = sales;
    shop.shop_tier = sales >= 50 ? 'diamond' : sales >= 20 ? 'gold' : sales >= 5 ? 'silver' : 'bronze';
    const { rows: respRows } = await db.query(
      `SELECT COUNT(*)::int as count, AVG(minutes)::int as avg_minutes
       FROM response_logs WHERE seller_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [shop.id]
    );
    shop.response_count = respRows[0]?.count || 0;
    shop.avg_response_minutes = respRows[0]?.avg_minutes || null;
    res.json(shop);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/shop/me — update shop info + holiday mode
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const { shop_name, shop_bio, holiday_mode, holiday_message, holiday_until } = req.body;
    await getDB().query(
      'UPDATE users SET shop_name=$1, shop_bio=$2, holiday_mode=$3, holiday_message=$4, holiday_until=$5 WHERE id=$6',
      [shop_name||null, shop_bio||null, holiday_mode?1:0, holiday_message||null, holiday_until||null, req.user.id]
    );
    res.json({ message: 'อัปเดตข้อมูลร้านค้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/shop/me/banner — upload banner image
router.patch('/me/banner', authMiddleware, (req, res) => {
  bannerUpload.single('banner')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกรูปภาพ' });
      const result = await uploadToCloudinary(req.file.buffer, { folder: 'mueasong/banners' });
      const bannerUrl = result.secure_url;
      await getDB().query('UPDATE users SET shop_banner = $1 WHERE id = $2', [bannerUrl, req.user.id]);
      res.json({ shop_banner: bannerUrl, message: 'อัปเดตแบนเนอร์ร้านค้าแล้ว' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

module.exports = router;
