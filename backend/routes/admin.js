const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

router.use(authMiddleware);

router.get('/stats', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const queries = [
      db.query('SELECT COUNT(*) as c FROM users'),
      db.query('SELECT COUNT(*) as c FROM products'),
      db.query("SELECT COUNT(*) as c FROM products WHERE status='available'"),
      db.query("SELECT COUNT(*) as c FROM products WHERE status='sold'"),
      db.query('SELECT COUNT(*) as c FROM orders'),
      db.query('SELECT SUM(total) as s FROM orders'),
    ];
    const results = await Promise.all(queries);
    res.json({
      users: parseInt(results[0].rows[0].c),
      products: parseInt(results[1].rows[0].c),
      available: parseInt(results[2].rows[0].c),
      sold: parseInt(results[3].rows[0].c),
      orders: parseInt(results[4].rows[0].c),
      revenue: results[5].rows[0].s || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', adminOnly, async (req, res) => {
  try {
    const { q } = req.query;
    let sql = 'SELECT id, name, email, rating, review_count, is_admin, is_banned, created_at FROM users';
    const params = [];
    if (q) { sql += ' WHERE name ILIKE $1 OR email ILIKE $2'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await getDB().query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/users/:id/toggle-admin', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const { rows: ur } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const user = ur[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสิทธิ์ตัวเองได้' });
    const newVal = user.is_admin ? 0 : 1;
    await db.query('UPDATE users SET is_admin = $1 WHERE id = $2', [newVal, req.params.id]);
    res.json({ message: newVal ? `ให้สิทธิ์ Admin แก่ ${user.name} แล้ว 🛡️` : `ถอดสิทธิ์ Admin ของ ${user.name} แล้ว`, is_admin: newVal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/users/:id/ban', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const { rows: ur } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const user = ur[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (user.is_admin) return res.status(400).json({ error: 'ไม่สามารถ ban admin ได้' });
    await db.query('UPDATE users SET is_banned = $1 WHERE id = $2', [user.is_banned ? 0 : 1, req.params.id]);
    res.json({ message: user.is_banned ? 'ปลดแบนแล้ว' : 'แบนผู้ใช้แล้ว', banned: !user.is_banned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/products', adminOnly, async (req, res) => {
  try {
    const { q, status } = req.query;
    let sql = 'SELECT p.*, u.name as seller_name FROM products p JOIN users u ON p.seller_id = u.id';
    const params = [];
    const where = [];
    let n = 0;
    if (q) { where.push(`(p.title ILIKE $${++n} OR u.name ILIKE $${++n})`); params.push(`%${q}%`, `%${q}%`); }
    if (status) { where.push(`p.status = $${++n}`); params.push(status); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY p.created_at DESC';
    const { rows } = await getDB().query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/products/:id', adminOnly, async (req, res) => {
  try {
    await getDB().query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ message: 'ลบสินค้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/products/:id/status', adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    await getDB().query('UPDATE products SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ message: 'อัปเดตสถานะแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/users/:id/verify', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const { rows: ur } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!ur[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    await db.query('UPDATE users SET is_verified = $1 WHERE id = $2', [ur[0].is_verified ? 0 : 1, req.params.id]);
    res.json({ message: ur[0].is_verified ? 'ยกเลิกการยืนยันแล้ว' : 'ยืนยันผู้ใช้แล้ว', is_verified: !ur[0].is_verified });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/disputes', adminOnly, async (req, res) => {
  try {
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

router.patch('/disputes/:id', adminOnly, async (req, res) => {
  try {
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

// Verify requests
router.get('/verify-requests', adminOnly, async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT vr.*, u.name, u.email, u.rating, u.review_count, u.is_verified,
        (SELECT COUNT(*) FROM products WHERE seller_id = u.id) as product_count
      FROM verify_requests vr
      JOIN users u ON vr.user_id = u.id
      ORDER BY CASE vr.status WHEN 'pending' THEN 0 ELSE 1 END, vr.created_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/verify-requests/:id', adminOnly, async (req, res) => {
  try {
    const { action, admin_note } = req.body; // action: 'approve' | 'reject'
    const db = getDB();
    const { rows: vr } = await db.query('SELECT * FROM verify_requests WHERE id = $1', [req.params.id]);
    if (!vr[0]) return res.status(404).json({ error: 'ไม่พบคำขอ' });
    const status = action === 'approve' ? 'approved' : 'rejected';
    await db.query('UPDATE verify_requests SET status = $1, admin_note = $2 WHERE id = $3', [status, admin_note || null, req.params.id]);
    if (action === 'approve') {
      await db.query('UPDATE users SET is_verified = 1 WHERE id = $1', [vr[0].user_id]);
    }
    // แจ้งเตือน user
    const msg = action === 'approve'
      ? 'ยินดีด้วย! บัญชีของคุณได้รับ ✅ Verified Badge แล้ว'
      : `คำขอ Verified ถูกปฏิเสธ${admin_note ? ': ' + admin_note : ''}`;
    await db.query(
      "INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'system','สถานะ Verified Badge',$2)",
      [vr[0].user_id, msg]
    );
    res.json({ message: action === 'approve' ? 'อนุมัติแล้ว ✅' : 'ปฏิเสธแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
