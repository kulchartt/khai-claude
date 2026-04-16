const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });

// GET /api/stories — active stories only (not expired)
router.get('/', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT s.*, u.name as author_name, u.avatar as author_avatar
       FROM stories s JOIN users u ON s.user_id=u.id
       WHERE s.expires_at > NOW()
       ORDER BY s.created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/stories
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { caption='' } = req.body;
    let image_url = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, { folder: 'ploikhong/stories' });
      image_url = result.secure_url;
    }
    if (!image_url && !caption) return res.status(400).json({ error: 'ต้องมีรูปภาพหรือข้อความ' });
    const { rows } = await getDB().query(
      `INSERT INTO stories (user_id, image_url, caption, expires_at)
       VALUES ($1,$2,$3, NOW() + INTERVAL '24 hours') RETURNING *`,
      [req.user.id, image_url, caption]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/stories/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query('SELECT user_id FROM stories WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบ story' });
    if (rows[0].user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    await getDB().query('DELETE FROM stories WHERE id=$1', [req.params.id]);
    res.json({ message: 'ลบ story แล้ว' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
