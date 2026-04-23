const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/complaints — submit complaint (no auth required)
router.post('/', async (req, res) => {
  try {
    const { type, detail, contact, user_id } = req.body;
    if (!type || !detail) return res.status(400).json({ error: 'กรุณากรอกประเภทและรายละเอียด' });
    await getDB().query(
      `INSERT INTO complaints (type, detail, contact, user_id) VALUES ($1,$2,$3,$4)`,
      [type, detail, contact || null, user_id || null]
    );
    res.json({ ok: true, message: 'รับเรื่องร้องเรียนแล้ว ทีมงานจะดำเนินการภายใน 24 ชั่วโมง' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/complaints/my — user's own complaints
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT id, type, detail, contact, status, admin_reply, replied_at, created_at FROM complaints WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/complaints — admin only
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: adminCheck } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (!adminCheck[0]?.is_admin) return res.status(403).json({ error: 'Admin only' });
    const { status } = req.query;
    const where = status ? `WHERE c.status = $1` : '';
    const params = status ? [status] : [];
    const { rows } = await db.query(`
      SELECT c.*, u.name as user_name, u.email as user_email
      FROM complaints c
      LEFT JOIN users u ON c.user_id = u.id
      ${where}
      ORDER BY c.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/complaints/:id — update status + optional admin_reply (admin only)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: adminCheck } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (!adminCheck[0]?.is_admin) return res.status(403).json({ error: 'Admin only' });
    const { status, admin_reply } = req.body;

    if (admin_reply !== undefined) {
      // Update reply (and optionally status)
      if (status) {
        await db.query(
          `UPDATE complaints SET status=$1, admin_reply=$2, replied_at=NOW() WHERE id=$3`,
          [status, admin_reply, req.params.id]
        );
      } else {
        await db.query(
          `UPDATE complaints SET admin_reply=$1, replied_at=NOW() WHERE id=$2`,
          [admin_reply, req.params.id]
        );
      }
    } else {
      await db.query(`UPDATE complaints SET status=$1 WHERE id=$2`, [status, req.params.id]);
    }

    // Notify user if they have an account
    const { rows: complaint } = await db.query('SELECT user_id FROM complaints WHERE id=$1', [req.params.id]);
    if (complaint[0]?.user_id && admin_reply) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,'system','ทีมงานตอบกลับเรื่องร้องเรียนของคุณ',$2,'/complaints')`,
        [complaint[0].user_id, admin_reply.slice(0, 80)]
      );
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/complaints/:id/messages — get chat messages for a complaint
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: adminCheck } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    const isAdmin = !!adminCheck[0]?.is_admin;

    // Check ownership (user must own the complaint, or be admin)
    const { rows: comp } = await db.query('SELECT user_id FROM complaints WHERE id=$1', [req.params.id]);
    if (!comp[0]) return res.status(404).json({ error: 'ไม่พบเรื่องร้องเรียน' });
    if (!isAdmin && comp[0].user_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });

    const { rows } = await db.query(
      `SELECT * FROM complaint_messages WHERE complaint_id=$1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/complaints/:id/messages — send a message (user or admin)
router.post('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'กรุณากรอกข้อความ' });

    const { rows: adminCheck } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    const isAdmin = !!adminCheck[0]?.is_admin;

    const { rows: comp } = await db.query('SELECT user_id FROM complaints WHERE id=$1', [req.params.id]);
    if (!comp[0]) return res.status(404).json({ error: 'ไม่พบเรื่องร้องเรียน' });
    if (!isAdmin && comp[0].user_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });

    const senderType = isAdmin ? 'admin' : 'user';
    const { rows } = await db.query(
      `INSERT INTO complaint_messages (complaint_id, sender_type, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, senderType, content.trim()]
    );

    // Notify the other party
    if (isAdmin && comp[0].user_id) {
      await db.query(
        `INSERT INTO notifications (user_id,type,title,body,link) VALUES ($1,'system','ทีมงานตอบกลับเรื่องร้องเรียน',$2,'/complaints')`,
        [comp[0].user_id, content.trim().slice(0, 80)]
      );
      // Also update admin_reply for backward compat
      await db.query(`UPDATE complaints SET admin_reply=$1, replied_at=NOW() WHERE id=$2`, [content.trim(), req.params.id]);
    }

    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
