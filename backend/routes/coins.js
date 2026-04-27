const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ─── OPN (Omise) ──────────────────────────────────────────────────────────────
const Omise = require('omise')({
  publicKey:  process.env.OPN_PUBLIC_KEY  || '',
  secretKey:  process.env.OPN_SECRET_KEY  || '',
  omiseVersion: '2019-05-29',
});

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
      `SELECT fa.*, p.title as product_title, p.price as product_price,
              p.image_url as product_image
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

// GET /api/coins/admin/stats — full premium analytics for admin
router.get('/admin/stats', async (req, res) => {
  // inline admin check (authMiddleware already ran)
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  try {
    const db = getDB();
    const [
      revenueTotal,
      revenueByPackage,
      featureUsage,
      activeNow,
      pendingPayments,
      monthlyRevenue,
      topBuyers,
      coinIssuedTotal,
    ] = await Promise.all([
      // Total confirmed revenue
      db.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count
                FROM payment_requests WHERE status='confirmed'`),

      // Revenue per package
      db.query(`SELECT package_key, COUNT(*) as count, COALESCE(SUM(amount),0) as revenue
                FROM payment_requests WHERE status='confirmed'
                GROUP BY package_key ORDER BY revenue DESC`),

      // Feature activations count (all time)
      db.query(`SELECT feature_key, COUNT(*) as total, COALESCE(SUM(coins_spent),0) as coins_spent
                FROM feature_activations
                GROUP BY feature_key ORDER BY total DESC`),

      // Currently active features (not expired)
      db.query(`SELECT feature_key, COUNT(*) as active_count
                FROM feature_activations WHERE expires_at > NOW()
                GROUP BY feature_key ORDER BY active_count DESC`),

      // Pending payment requests
      db.query(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total
                FROM payment_requests WHERE status='pending'`),

      // Monthly revenue — last 6 months
      db.query(`SELECT TO_CHAR(DATE_TRUNC('month', created_at),'YYYY-MM') as month,
                       COUNT(*) as transactions,
                       COALESCE(SUM(amount),0) as revenue,
                       COALESCE(SUM(coins),0) as coins_issued
                FROM payment_requests WHERE status='confirmed'
                  AND created_at >= NOW() - INTERVAL '6 months'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month`),

      // Top 5 buyers by coins purchased
      db.query(`SELECT u.name, u.email, u.coin_balance,
                       COUNT(pr.id) as purchases, COALESCE(SUM(pr.amount),0) as total_spent
                FROM payment_requests pr JOIN users u ON u.id = pr.user_id
                WHERE pr.status='confirmed'
                GROUP BY u.id, u.name, u.email, u.coin_balance
                ORDER BY total_spent DESC LIMIT 5`),

      // Total coins ever issued vs spent
      db.query(`SELECT
                  COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) as issued,
                  COALESCE(SUM(CASE WHEN delta<0 THEN ABS(delta) ELSE 0 END),0) as spent
                FROM coin_transactions`),
    ]);

    const totalRevenueBaht = parseFloat(revenueTotal.rows[0].total);
    const totalCoinsIssued = parseInt(coinIssuedTotal.rows[0].issued);
    const totalCoinsSpent = parseInt(coinIssuedTotal.rows[0].spent);
    // avg baht value per coin (for estimating per-feature revenue)
    const avgCoinValue = totalCoinsIssued > 0 ? totalRevenueBaht / totalCoinsIssued : 0;

    res.json({
      revenue: {
        total: totalRevenueBaht,
        count: parseInt(revenueTotal.rows[0].count),
      },
      // Revenue sources — extensible for future streams (transaction fees, ads, etc.)
      revenue_sources: [
        {
          source: 'coin_purchases',
          label: 'ขายเหรียญ Premium',
          total: totalRevenueBaht,
          count: parseInt(revenueTotal.rows[0].count),
        },
        {
          source: 'transaction_fees',
          label: 'ค่าธรรมเนียมการขาย (3%)',
          total: 0,
          count: 0,
        },
      ],
      revenue_by_package: revenueByPackage.rows.map(r => ({
        package_key: r.package_key,
        count: parseInt(r.count),
        revenue: parseFloat(r.revenue),
      })),
      feature_usage: featureUsage.rows.map(r => ({
        feature_key: r.feature_key,
        total: parseInt(r.total),
        coins_spent: parseInt(r.coins_spent),
        // estimated baht = coins_spent × avg_baht_per_coin
        estimated_baht: Math.round(parseInt(r.coins_spent) * avgCoinValue),
      })),
      active_now: activeNow.rows.map(r => ({
        feature_key: r.feature_key,
        active_count: parseInt(r.active_count),
      })),
      pending: {
        count: parseInt(pendingPayments.rows[0].count),
        total: parseFloat(pendingPayments.rows[0].total),
      },
      monthly_revenue: monthlyRevenue.rows.map(r => ({
        month: r.month,
        transactions: parseInt(r.transactions),
        revenue: parseFloat(r.revenue),
        coins_issued: parseInt(r.coins_issued),
      })),
      top_buyers: topBuyers.rows.map(r => ({
        name: r.name,
        email: r.email,
        coin_balance: parseInt(r.coin_balance),
        purchases: parseInt(r.purchases),
        total_spent: parseFloat(r.total_spent),
      })),
      coins: {
        issued: totalCoinsIssued,
        spent: totalCoinsSpent,
        outstanding: totalCoinsIssued - totalCoinsSpent,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

// DELETE /api/coins/payment-requests/:id — admin deletes OPN pending record
router.delete('/payment-requests/:id', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query('SELECT * FROM payment_requests WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบรายการ' });
    if (rows[0].status !== 'pending') return res.status(400).json({ error: 'ลบได้เฉพาะรายการที่ยังรออยู่เท่านั้น' });
    await db.query('DELETE FROM payment_requests WHERE id=$1', [req.params.id]);
    res.json({ message: 'ลบรายการแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/coins/charge — OPN card charge (token from OPN.js) ─────────────
router.post('/charge', authMiddleware, async (req, res) => {
  try {
    const db  = getDB();
    const { package_key, token } = req.body;
    const pkg = PACKAGES.find(p => p.key === package_key);
    if (!pkg)   return res.status(400).json({ error: 'แพ็กเกจไม่ถูกต้อง' });
    if (!token) return res.status(400).json({ error: 'ไม่พบ payment token' });

    const charge = await Omise.charges.create({
      amount:      pkg.price * 100,       // สตางค์
      currency:    'thb',
      card:        token,
      description: `PloiKhong — ${pkg.label} (${pkg.coins} เหรียญ)`,
      capture:     true,
      metadata:    { user_id: req.user.id, package_key },
    });

    if (charge.status !== 'successful') {
      return res.status(402).json({ error: charge.failure_message || 'ชำระเงินไม่สำเร็จ' });
    }

    // เติมเหรียญทันที (บันทึกใน coin_transactions โดยอัตโนมัติ ไม่ต้องใส่ใน payment_requests)
    await addCoins(db, req.user.id, pkg.coins, 'purchase', `ซื้อ ${pkg.label} (OPN Card ${charge.id})`);

    res.json({ success: true, charge_id: charge.id, coins: pkg.coins });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/coins/charge-promptpay — OPN PromptPay QR ─────────────────────
router.post('/charge-promptpay', authMiddleware, async (req, res) => {
  try {
    const db  = getDB();
    const { package_key } = req.body;
    const pkg = PACKAGES.find(p => p.key === package_key);
    if (!pkg) return res.status(400).json({ error: 'แพ็กเกจไม่ถูกต้อง' });

    // สร้าง PromptPay source
    const source = await Omise.sources.create({
      type:     'promptpay',
      amount:   pkg.price * 100,
      currency: 'thb',
    });

    // สร้าง charge
    const charge = await Omise.charges.create({
      amount:      pkg.price * 100,
      currency:    'thb',
      source:      source.id,
      description: `PloiKhong — ${pkg.label} (${pkg.coins} เหรียญ)`,
      metadata:    { user_id: req.user.id, package_key },
      return_uri:  `${process.env.FRONTEND_URL || 'https://frontend-next-pied.vercel.app'}/coins?payment=success`,
    });

    // เก็บ charge_id ไว้รอ webhook
    await db.query(
      `INSERT INTO payment_requests (user_id, package_key, coins, amount, sender_name, slip_url, status)
       VALUES ($1,$2,$3,$4,'OPN PromptPay',$5,'pending')`,
      [req.user.id, pkg.key, pkg.coins, pkg.price, charge.id]
    );

    res.json({
      charge_id:   charge.id,
      qr_code_url: charge.source?.scannable_code?.image?.download_uri || charge.authorize_uri,
      amount:      pkg.price,
      expires_at:  charge.expires_at,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/coins/webhook/opn — OPN webhook (auto confirm PromptPay) ───────
router.post('/webhook/opn', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const db   = getDB();
    const body = JSON.parse(req.body.toString());
    if (body.key !== 'charge.complete') return res.sendStatus(200);

    const charge = body.data;
    if (charge.status !== 'successful') return res.sendStatus(200);

    // หา payment_request จาก charge_id
    const { rows } = await db.query(
      `SELECT * FROM payment_requests WHERE slip_url = $1 AND status = 'pending' LIMIT 1`,
      [charge.id]
    );
    if (!rows.length) return res.sendStatus(200);

    const pr = rows[0];

    // เติมเหรียญ
    await addCoins(db, pr.user_id, pr.coins, 'purchase',
      `ซื้อ ${pr.package_key} — PromptPay (${charge.id})`);

    // อัปเดตสถานะ
    await db.query(
      `UPDATE payment_requests SET status='confirmed' WHERE id=$1`,
      [pr.id]
    );

    // แจ้งเตือน user
    await db.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'coin','เติมเหรียญสำเร็จ! 🪙',$2)`,
      [pr.user_id, `ได้รับ ${pr.coins.toLocaleString()} เหรียญจากการชำระเงิน PromptPay`]
    );

    res.sendStatus(200);
  } catch (e) { console.error('OPN webhook error:', e); res.sendStatus(500); }
});

// ─── POST /api/coins/test/simulate-payment — TEST MODE ONLY ──────────────────
// จำลองการชำระเงิน PromptPay สำหรับทดสอบ (ใช้ได้เฉพาะ OPN test key)
router.post('/test/simulate-payment', authMiddleware, async (req, res) => {
  const isTestMode = (process.env.OPN_SECRET_KEY || '').startsWith('skey_test_');
  if (!isTestMode) return res.status(403).json({ error: 'ใช้ได้เฉพาะ test mode เท่านั้น' });

  try {
    const db = getDB();
    const { charge_id } = req.body;
    if (!charge_id) return res.status(400).json({ error: 'กรุณาระบุ charge_id' });

    const { rows } = await db.query(
      `SELECT * FROM payment_requests WHERE slip_url = $1 AND status = 'pending' LIMIT 1`,
      [charge_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'ไม่พบรายการ หรือยืนยันไปแล้ว' });

    const pr = rows[0];
    // ตรวจว่าเป็นของ user ที่ request เอง
    if (pr.user_id !== req.user.id) return res.status(403).json({ error: 'ไม่ใช่รายการของคุณ' });

    await addCoins(db, pr.user_id, pr.coins, 'purchase',
      `ซื้อ ${pr.package_key} — PromptPay TEST (${charge_id})`);
    await db.query(`UPDATE payment_requests SET status='confirmed' WHERE id=$1`, [pr.id]);
    await db.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'coin','เติมเหรียญสำเร็จ! 🪙',$2)`,
      [pr.user_id, `[TEST] ได้รับ ${pr.coins} เหรียญ`]
    );

    const { rows: ur } = await db.query('SELECT coin_balance FROM users WHERE id=$1', [pr.user_id]);
    res.json({ success: true, coins: pr.coins, new_balance: ur[0]?.coin_balance || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
