const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024 } });

const CATEGORIES = ['ทั่วไป','ถาม-ตอบ','แชร์ดีล','รีวิวสินค้า','นัดแนะ'];

// GET /api/community/posts?category=&page=
router.get('/posts', async (req, res) => {
  try {
    const { category, page=1 } = req.query;
    const limit = 20, offset = (page-1)*limit;
    let q = `SELECT p.*, u.name as author_name, u.avatar as author_avatar,
      (SELECT COUNT(*)::int FROM post_comments WHERE post_id=p.id) as comment_count,
      (SELECT COUNT(*)::int FROM post_likes WHERE post_id=p.id) as like_count
      FROM posts p JOIN users u ON p.user_id=u.id`;
    const vals = [];
    if (category && category !== 'ทั้งหมด') { q += ' WHERE p.category=$1'; vals.push(category); }
    q += ' ORDER BY p.created_at DESC LIMIT $'+(vals.length+1)+' OFFSET $'+(vals.length+2);
    vals.push(limit, offset);
    const { rows } = await getDB().query(q, vals);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/community/posts
router.post('/posts', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, content, category='ทั่วไป' } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'กรุณากรอก title และ content' });
    let image_url = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, { folder: 'ploikhong/community' });
      image_url = result.secure_url;
    }
    const { rows } = await getDB().query(
      'INSERT INTO posts (user_id,title,content,category,image_url) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, title, content, category, image_url]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/community/posts/:id
router.get('/posts/:id', async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query(
      `SELECT p.*, u.name as author_name, u.avatar as author_avatar,
       (SELECT COUNT(*)::int FROM post_likes WHERE post_id=p.id) as like_count
       FROM posts p JOIN users u ON p.user_id=u.id WHERE p.id=$1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบโพสต์' });
    const { rows: comments } = await db.query(
      `SELECT c.*, u.name as author_name, u.avatar as author_avatar
       FROM post_comments c JOIN users u ON c.user_id=u.id
       WHERE c.post_id=$1 ORDER BY c.created_at ASC`, [req.params.id]
    );
    res.json({ ...rows[0], comments });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/community/posts/:id
router.delete('/posts/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query('SELECT user_id FROM posts WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบโพสต์' });
    if (rows[0].user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    await db.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    res.json({ message: 'ลบโพสต์แล้ว' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/community/posts/:id/comment
router.post('/posts/:id/comment', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'กรุณากรอกความคิดเห็น' });
    const { rows } = await getDB().query(
      'INSERT INTO post_comments (post_id,user_id,content) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.user.id, content]
    );
    const { rows: full } = await getDB().query(
      'SELECT c.*, u.name as author_name, u.avatar as author_avatar FROM post_comments c JOIN users u ON c.user_id=u.id WHERE c.id=$1',
      [rows[0].id]
    );
    res.json(full[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/community/posts/:id/like  (toggle)
router.post('/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query('SELECT 1 FROM post_likes WHERE post_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (rows.length) {
      await db.query('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
      res.json({ liked: false });
    } else {
      await db.query('INSERT INTO post_likes (post_id,user_id) VALUES ($1,$2)', [req.params.id, req.user.id]);
      res.json({ liked: true });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
