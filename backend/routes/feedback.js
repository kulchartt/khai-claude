const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  next();
}

const router = express.Router();

// Self-healing table + new columns
const db = getDB();
db.query(`CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  sender_name TEXT DEFAULT NULL,
  sender_email TEXT DEFAULT NULL,
  is_read INTEGER DEFAULT 0,
  admin_note TEXT DEFAULT NULL,
  admin_reply TEXT DEFAULT NULL,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(e => console.error('feedback table init error:', e.message));

// Add columns if they don't exist yet (idempotent migration)
db.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_reply TEXT DEFAULT NULL`).catch(() => {});
db.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new'`).catch(() => {});
db.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NULL`).catch(() => {});

// Conversation thread table
db.query(`CREATE TABLE IF NOT EXISTS feedback_messages (
  id SERIAL PRIMARY KEY,
  feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(() => {});

const CATEGORIES = ['inquiry', 'bug', 'feature', 'complaint', 'review', 'keep', 'other'];
const STATUS_LABEL = { new: 'ใหม่', reviewed: 'รับเรื่องแล้ว', resolved: 'แก้ไขแล้ว' };

// POST /api/feedback — no auth required
router.post('/', async (req, res) => {
  try {
    const { category, message, sender_name, sender_email } = req.body;
    if (!category || !CATEGORIES.includes(category)) return res.status(400).json({ error: 'หมวดหมู่ไม่ถูกต้อง' });
    if (!message || message.trim().length < 5) return res.status(400).json({ error: 'กรุณาระบุข้อความอย่างน้อย 5 ตัวอักษร' });
    await db.query(
      'INSERT INTO feedback (category, message, sender_name, sender_email) VALUES ($1,$2,$3,$4)',
      [category, message.trim(), sender_name?.trim() || null, sender_email?.trim() || null]
    );
    res.json({ message: 'ขอบคุณสำหรับ Feedback! 🙏 ทีมงานจะนำไปปรับปรุงครับ' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/feedback/my — logged-in user sees their own submissions (matched by email)
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, category, message, sender_name, status, created_at, updated_at
         FROM feedback
        WHERE LOWER(sender_email) = LOWER($1)
        ORDER BY created_at DESC`,
      [req.user.email]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/feedback/admin — admin only (all items)
router.get('/admin', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM feedback ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/feedback/admin/unread-count — for badge
router.get('/admin/unread-count', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT COUNT(*) AS cnt FROM feedback WHERE is_read = 0`);
    res.json({ count: parseInt(rows[0].cnt) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/feedback/admin/:id — update status, is_read, admin_note (no more admin_reply)
router.patch('/admin/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { is_read, admin_note, status } = req.body;
    const id = parseInt(req.params.id);

    // Fetch current row (for notification logic)
    const { rows: [fb] } = await db.query('SELECT * FROM feedback WHERE id = $1', [id]);
    if (!fb) return res.status(404).json({ error: 'ไม่พบ Feedback' });

    const hasChange = status || admin_note;
    await db.query(
      `UPDATE feedback SET
        is_read      = COALESCE($1, is_read),
        admin_note   = COALESCE($2, admin_note),
        status       = COALESCE($3, status),
        updated_at   = CASE WHEN $4 THEN NOW() ELSE updated_at END
       WHERE id = $5`,
      [is_read ?? null, admin_note ?? null, status ?? null, !!hasChange, id]
    );

    // Notify user if status changed and sender_email matches a registered user
    const statusChanged = status && status !== fb.status;

    if (statusChanged && fb.sender_email) {
      const { rows: users } = await db.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [fb.sender_email]
      );
      if (users.length) {
        const uid = users[0].id;
        const label = STATUS_LABEL[status] || status;
        const title = '📩 อัปเดต Feedback ของคุณ';
        const body  = `Feedback ของคุณถูกอัปเดตสถานะเป็น "${label}" แล้ว`;

        await db.query(
          `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'system', $2, $3)`,
          [uid, title, body]
        );

        const io          = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
          const sock = onlineUsers.get(uid);
          if (sock) {
            io.to(sock).emit('notification', { title, body });
            io.to(sock).emit('feedback:update', { status: status || fb.status, feedbackId: id });
          }
        }
      }
    }

    res.json({ message: 'อัปเดตแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/feedback/:id/messages — auth required, access control
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { rows: [fb] } = await db.query('SELECT * FROM feedback WHERE id = $1', [id]);
    if (!fb) return res.status(404).json({ error: 'ไม่พบ Feedback' });

    if (!req.user.is_admin) {
      if (!fb.sender_email || fb.sender_email.toLowerCase() !== req.user.email.toLowerCase()) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
      }
    }

    const { rows } = await db.query(
      'SELECT * FROM feedback_messages WHERE feedback_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/feedback/:id/messages — auth required, access control
router.post('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { message } = req.body;
    if (!message || message.trim().length < 1) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความ' });

    const { rows: [fb] } = await db.query('SELECT * FROM feedback WHERE id = $1', [id]);
    if (!fb) return res.status(404).json({ error: 'ไม่พบ Feedback' });

    if (!req.user.is_admin) {
      if (!fb.sender_email || fb.sender_email.toLowerCase() !== req.user.email.toLowerCase()) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
      }
    }

    const isAdmin = !!req.user.is_admin;
    await db.query(
      'INSERT INTO feedback_messages (feedback_id, is_admin, message) VALUES ($1, $2, $3)',
      [id, isAdmin, message.trim()]
    );

    // Update feedback updated_at and mark unread for admin when user replies
    await db.query(
      `UPDATE feedback SET updated_at = NOW(), is_read = CASE WHEN $1 THEN is_read ELSE 0 END WHERE id = $2`,
      [isAdmin, id]
    );

    const io          = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');

    if (isAdmin && fb.sender_email) {
      // Admin replied → notify user via socket + notification
      const { rows: users } = await db.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [fb.sender_email]
      );
      if (users.length) {
        const uid = users[0].id;
        const title = '📩 อัปเดต Feedback ของคุณ';
        const body  = `แอดมินตอบกลับ Feedback ของคุณ: "${message.trim().slice(0, 60)}${message.trim().length > 60 ? '…' : ''}"`;

        await db.query(
          `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'system', $2, $3)`,
          [uid, title, body]
        );

        if (io && onlineUsers) {
          const sock = onlineUsers.get(uid);
          if (sock) {
            io.to(sock).emit('notification', { title, body });
            io.to(sock).emit('feedback:update', { status: fb.status, feedbackId: id });
          }
        }
      }
    }

    res.json({ message: 'ส่งข้อความแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
