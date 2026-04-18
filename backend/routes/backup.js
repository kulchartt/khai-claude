const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { cloudinary } = require('../cloudinary');

const router = express.Router();

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  next();
}

// GET /api/backup — admin only, dumps all tables
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  const db = getDB();
  const tables = [
    'users', 'products', 'product_images', 'orders', 'order_items',
    'cart_items', 'wishlist_items', 'messages', 'chat_rooms',
    'reviews', 'buyer_reviews', 'notifications', 'offers', 'follows',
    'addresses', 'saved_searches', 'disputes', 'promo_codes',
    'verify_requests', 'reports', 'feedback', 'feedback_messages',
    'bundles', 'posts', 'post_comments', 'post_likes', 'stories',
    'points_log', 'referrals', 'response_logs', 'blocks',
    'webauthn_credentials', 'webauthn_challenges',
  ];

  const backup = {
    exported_at: new Date().toISOString(),
    tables: {}
  };

  for (const table of tables) {
    try {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      backup.tables[table] = rows;
    } catch (e) {
      backup.tables[table] = { error: e.message };
    }
  }

  // Full env snapshot for restore purposes (admin-only endpoint)
  const cfg = cloudinary.config();
  backup.env = {
    node_env: process.env.NODE_ENV,
    frontend_url: process.env.FRONTEND_URL,
    cloudinary_cloud_name: cfg.cloud_name,
    cloudinary_api_key: cfg.api_key,
    cloudinary_api_secret: cfg.api_secret,
    jwt_secret: process.env.JWT_SECRET,
    database_url: process.env.DATABASE_URL,
  };

  res.json(backup);
});

module.exports = router;
