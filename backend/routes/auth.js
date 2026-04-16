const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const { authMiddleware, SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, referral_code } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว' });
    const db = getDB();
    const { rows: ex } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (ex[0]) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query('INSERT INTO users (name, email, password) VALUES ($1,$2,$3) RETURNING id', [name, email, hash]);
    const id = rows[0].id;
    // Generate referral code
    const myCode = (name.slice(0,3) + id).toUpperCase().replace(/[^A-Z0-9]/g,'') + Math.random().toString(36).slice(2,5).toUpperCase();
    await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', [myCode, id]);
    // Handle referral
    if (referral_code) {
      try {
        const { rows: refRows } = await db.query('SELECT id FROM users WHERE UPPER(referral_code) = $1', [referral_code.toUpperCase()]);
        if (refRows[0] && refRows[0].id !== id) {
          const referrerId = refRows[0].id;
          await db.query('INSERT INTO referrals (referrer_id, referee_id, rewarded) VALUES ($1,$2,1) ON CONFLICT DO NOTHING', [referrerId, id]);
          await db.query('UPDATE users SET points = points + 100 WHERE id = $1', [referrerId]);
          await db.query('UPDATE users SET points = points + 50 WHERE id = $1', [id]);
          await db.query("INSERT INTO points_log (user_id, points, reason) VALUES ($1,100,'รับแต้มจากการชวนเพื่อน')", [referrerId]);
          await db.query("INSERT INTO points_log (user_id, points, reason) VALUES ($1,50,'รับแต้มจากการสมัครผ่าน referral')", [id]);
        }
      } catch (refErr) { console.error('referral error:', refErr); }
    }
    const token = jwt.sign({ id, name, email }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, name, email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    const { rows } = await getDB().query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    if (user.is_banned) return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query(
      'SELECT id, name, email, avatar, rating, review_count, created_at, is_verified, is_admin, points, referral_code, holiday_mode FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const user = rows[0];
    // Compute shop tier from completed sales
    const { rows: tierRows } = await db.query(
      `SELECT COUNT(DISTINCT o.id)::int as sales FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE p.seller_id = $1 AND o.status = 'completed'`, [user.id]
    );
    const sales = tierRows[0]?.sales || 0;
    user.sales_count = sales;
    user.shop_tier = sales >= 50 ? 'diamond' : sales >= 20 ? 'gold' : sales >= 5 ? 'silver' : 'bronze';
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
