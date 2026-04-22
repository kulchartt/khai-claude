const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ─── Coin packages ────────────────────────────────────────────────────────────

const PACKAGES = [
  { key: 'coins_100',  coins: 100,  price: 99,   label: 'เหรียญ 100',  bonus: '' },
  { key: 'coins_350',  coins: 350,  price: 299,  label: 'เหรียญ 350',  bonus: 'ประหยัด 15%' },
  { key: 'coins_800',  coins: 800,  price: 599,  label: 'เหรียญ 800',  bonus: 'ประหยัด 25% 🔥' },
  { key: 'coins_1500', coins: 1500, price: 999,  label: 'เหรียญ 1500', bonus: 'ประหยัด 33% ⭐' },
];

// ─── Features store ────────────────────────────────────────────────────────────

const FEATURES = {
  boost:       { label: 'ดันสินค้าขึ้นบนสุด',      coins: 30,  days: 7,  icon: '🚀', desc: 'สินค้าของคุณจะขึ้นไปอยู่ด้านบนในหมวดหมู่เป็นเวลา 7 วัน' },
  price_alert: { label: 'แจ้งเตือนตั้งราคา',        coins: 25,  days: 30, icon: '🔔', desc: 'แจ้งเตือนผู้ซื้อที่สนใจสินค้าคล้ายกันเมื่อคุณปรับราคา' },
  auto_relist: { label: 'ลงประกาศอัตโนมัติ',         coins: 20,  days: 30, icon: '🔄', desc: 'ลงประกาศซ้ำอัตโนมัติทุก 7 วันเพื่อให้สดใหม่เสมอ' },
  featured:    { label: 'สินค้าเด่น (Featured)',     coins: 80,  days: 7,  icon: '⭐', desc: 'แสดงป้าย Featured และอยู่ในแถบสินค้าแนะนำหน้าแรก' },
  analytics_pro: { label: 'Analytics Pro',           coins: 50,  days: 30, icon: '📊', desc: 'ปลดล็อกข้อมูลเชิงลึก: Funnel วิเคราะห์ผู้ชม + AI Recommendations' },
};

// PromptPay number (configurable via env)
const PROMPTPAY_NUMBER = process.env.PROMPTPAY_NUMBER || '0812345678';
const PROMPTPAY_NAME   = process.env.PROMPTPAY_NAME   || 'ขายคล่อง';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function addCoins(db, userId, delta, type, description, refId = null) {
  await db.query(
    'UPDATE users SET coin_balance = GREATEST(0, coin_balance + $1) WHERE id = $2',
    [delta, userId]
  );
  await db.query(
    'INSERT INTO coin_transactions (user_id, delta, type, description, ref_id) VALUES ($1,$2,$3,$4,$5)',
    [userId, delta, type, description, refId]
  );
}

// ─── Public: packages list ────────────────────────────────────────────────────

router.get('/packages', (req, res) => {
  res.json({ packages: PACKAGES, features: FEATURES, promptpay: PROMPTPAY_NUMBER, promptpay_name: PROMPTPAY_NAME });
});

// ─── Auth-required routes ──────────────────────────────────────────────────────

router.use(authMiddleware);

// GET /api/coins/balance
router.get('/balance', async (req, res) => {
  try {
    const { rows } = await getDB().query('SELECT coin_balance FROM users WHERE id=$1', [req.user.id]);
    res.json({ balance: rows[0]?.coin_balance || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/coins/transactions
router.get('/transactions', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM coin_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/coins/request-payment — submit PromptPay slip
router.post('/request-payment', async (req, res) => {
  try {
    const { package_key, sender_name, slip_url } = req.body;
    const pkg = PACKAGES.find(p => p.key === package_key);
    if (!pkg) return res.status(400).json({ error: 'แพ็กเกจไม่ถูกต้อง' });
    if (!sender_name) return res.status(400).json({ error: 'กรุณาระบุชื่อผู้โอน' });

    const db = getDB();
    const { rows } = await db.query(
      `INSERT INTO payment_requests (user_id, package_key, coins, amount, sender_name, slip_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.user.id, package_key, pkg.coins, pkg.price, sender_name, slip_url || null]
    );
    // Notify admin via notification
    const { rows: admins } = await db.query('SELECT id FROM users WHERE is_admin=1');
    for (const admin of admins) {
      await db.query(
        `INSERT INTO notifications (user_id,type,title,body,link) VALUES ($1,'system','คำขอเติมเหรียญใหม่',$2,'/admin')`,
        [admin.id, `${req.user.name} ขอเติม ${pkg.coins} เหรียญ (฿${pkg.price})`]
      );
    }
    res.json({ id: rows[0].id, message: 'ส่งคำขอเรียบร้อย รอ Admin ยืนยัน (ปกติภายใน 15 นาที)' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/coins/payment-requests — my own pending requests
router.get('/payment-requests/my', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM payment_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/coins/activate-feature — spend coins to activate a feature
router.post('/activate-feature', async (req, res) => {
  try {
    const { feature_key, product_id } = req.body;
    const feature = FEATURES[feature_key];
    if (!feature) return res.status(400).json({ error: 'ฟีเจอร์ไม่ถูกต้อง' });

    const db = getDB();

    // Check balance
    const { rows: ur } = await db.query('SELECT coin_balance FROM users WHERE id=$1', [req.user.id]);
    const balance = ur[0]?.coin_balance || 0;
    if (balance < feature.coins) {
      return res.status(400).json({ error: `เหรียญไม่พอ (มี ${balance} เหรียญ ต้องการ ${feature.coins} เหรียญ)` });
    }

    // If product-level feature, validate ownership
    if (product_id) {
      const { rows: pr } = await db.query('SELECT seller_id FROM products WHERE id=$1', [product_id]);
      if (!pr[0] || pr[0].seller_id !== req.user.id) {
        return res.status(403).json({ error: 'ไม่ใช่สินค้าของคุณ' });
      }
    }

    // Deduct coins
    await addCoins(db, req.user.id, -feature.coins, 'spend', `ใช้ฟีเจอร์: ${feature.label}${product_id ? ` (สินค้า #${product_id})` : ''}`);

    // Record activation
    const expiresAt = new Date(Date.now() + feature.days * 86400000);
    const { rows: ar } = await db.query(
      `INSERT INTO feature_activations (user_id, feature_key, product_id, coins_spent, expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, expires_at`,
      [req.user.id, feature_key, product_id || null, feature.coins, expiresAt]
    );

    // Side effects
    if (feature_key === 'featured' && product_id) {
      await db.query("UPDATE products SET bumped_at = NOW() WHERE id=$1", [product_id]);
    }
    if (feature_key === 'boost' && product_id) {
      await db.query("UPDATE products SET bumped_at = NOW() WHERE id=$1", [product_id]);
    }

    const newBalance = balance - feature.coins;
    res.json({
      message: `เปิดใช้งาน "${feature.label}" เรียบร้อย!`,
      expires_at: ar[0].expires_at,
      new_balance: newBalance,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/coins/active-features — list active features for current user
router.get('/active-features', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT fa.*, p.title as product_title
       FROM feature_activations fa
       LEFT JOIN products p ON p.id = fa.product_id
       WHERE fa.user_id=$1 AND fa.expires_at > NOW()
       ORDER BY fa.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

// GET /api/coins/payment-requests — list all pending (admin)
router.get('/payment-requests', adminOnly, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const { rows } = await getDB().query(
      `SELECT pr.*, u.name as user_name, u.email as user_email
       FROM payment_requests pr
       JOIN users u ON u.id = pr.user_id
       WHERE ($1::text = 'all' OR pr.status = $1)
       ORDER BY pr.created_at DESC LIMIT 100`,
      [status]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/coins/payment-requests/:id/confirm — admin confirms and adds coins
router.post('/payment-requests/:id/confirm', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const { rows: rr } = await db.query('SELECT * FROM payment_requests WHERE id=$1', [req.params.id]);
    const pr = rr[0];
    if (!pr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
    if (pr.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ดำเนินการไปแล้ว' });

    // Add coins to user
    await addCoins(db, pr.user_id, pr.coins, 'purchase', `ซื้อ ${pr.coins} เหรียญ (฿${pr.amount})`, pr.id);

    // Mark request as confirmed
    await db.query(
      'UPDATE payment_requests SET status=$1, confirmed_by=$2 WHERE id=$3',
      ['confirmed', req.user.id, pr.id]
    );

    // Notify user
    await db.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','เติมเหรียญสำเร็จ! 🎉',$2)`,
      [pr.user_id, `เติม ${pr.coins} เหรียญเรียบร้อยแล้ว ยอดรวม ${pr.coins} เหรียญถูกเพิ่มเข้าบัญชีคุณ`]
    );

    res.json({ message: `ยืนยันแล้ว เพิ่ม ${pr.coins} เหรียญให้ผู้ใช้เรียบร้อย` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/coins/payment-requests/:id/reject — admin rejects
router.post('/payment-requests/:id/reject', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const { note } = req.body;
    const { rows: rr } = await db.query('SELECT * FROM payment_requests WHERE id=$1', [req.params.id]);
    if (!rr[0]) return res.status(404).json({ error: 'ไม่พบคำขอ' });
    if (rr[0].status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ดำเนินการไปแล้ว' });

    await db.query(
      'UPDATE payment_requests SET status=$1, admin_note=$2 WHERE id=$3',
      ['rejected', note || null, req.params.id]
    );
    await db.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','คำขอเติมเหรียญถูกปฏิเสธ',$2)`,
      [rr[0].user_id, `คำขอเติมเหรียญ ${rr[0].coins} เหรียญถูกปฏิเสธ${note ? ': ' + note : ' กรุณาติดต่อทีมงาน'}`]
    );
    res.json({ message: 'ปฏิเสธคำขอแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
