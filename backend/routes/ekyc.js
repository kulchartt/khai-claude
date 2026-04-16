const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();

const ekycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

const getAI = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/ekyc — อัปโหลดบัตรประชาชนเพื่อยืนยันตัวตน
router.post('/', authMiddleware, (req, res) => {
  ekycUpload.single('id_card')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'กรุณาแนบรูปบัตรประชาชน' });

      // Upload to Cloudinary
      const result = await uploadToCloudinary(req.file.buffer, { folder: 'mueasong/ekyc' });
      const idCardUrl = result.secure_url;

      // Use Claude Vision to extract ID card info
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      const ai = getAI();
      const msg = await ai.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64Image }
            },
            {
              type: 'text',
              text: 'นี่คือรูปบัตรประชาชนไทย กรุณาสกัดข้อมูลและตอบเป็น JSON: {"name_th": "ชื่อ-นามสกุลภาษาไทย", "id_number": "เลข 13 หลัก", "valid": true/false}'
            }
          ]
        }]
      });

      let ekycName = null;
      let idNumber = null;
      let valid = false;

      try {
        const text = msg.content[0]?.text?.trim() || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          ekycName = parsed.name_th || null;
          idNumber = parsed.id_number || null;
          valid = parsed.valid === true;
        }
      } catch (parseErr) {
        valid = false;
      }

      if (!valid || !ekycName) {
        return res.status(400).json({ success: false, message: 'ไม่สามารถอ่านข้อมูลบัตรประชาชนได้ กรุณาถ่ายรูปให้ชัดขึ้น' });
      }

      const db = getDB();
      await db.query(
        'UPDATE users SET ekyc_verified = 1, ekyc_name = $1 WHERE id = $2',
        [ekycName, req.user.id]
      );

      res.json({ success: true, ekyc_name: ekycName, message: `ยืนยันตัวตนสำเร็จ! ชื่อ: ${ekycName}` });
    } catch (e) {
      if (e.status === 401) return res.status(500).json({ error: 'API key ไม่ถูกต้อง' });
      res.status(500).json({ error: e.message });
    }
  });
});

// GET /api/ekyc/status — ตรวจสอบสถานะ eKYC ของผู้ใช้ปัจจุบัน
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query(
      'SELECT ekyc_verified, ekyc_name FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json({ ekyc_verified: rows[0].ekyc_verified || 0, ekyc_name: rows[0].ekyc_name || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
