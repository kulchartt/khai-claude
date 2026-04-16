const express = require('express');
const Groq = require('groq-sdk');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const imgSearchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  }
});

const getAI = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

// POST /api/ai/description — AI ช่วยเขียนรายละเอียดสินค้า
router.post('/description', authMiddleware, async (req, res) => {
  try {
    const { title, category, condition } = req.body;
    const existing = (req.body.existing || '').slice(0, 500);
    if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อสินค้า' });

    const ai = getAI();
    const completion = await ai.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `เขียนรายละเอียดสินค้ามือสองภาษาไทยสำหรับตลาดออนไลน์ สั้น กระชับ น่าสนใจ ไม่เกิน 5 ประโยค

ข้อมูลสินค้า:
- ชื่อ: ${title}
- หมวดหมู่: ${category || 'ไม่ระบุ'}
- สภาพ: ${condition || 'ไม่ระบุ'}
${existing ? `- รายละเอียดเดิม: ${existing}` : ''}

เขียนเฉพาะรายละเอียดสินค้า ไม่ต้องมีหัวข้อหรือคำอธิบายอื่น`
      }]
    });

    const description = completion.choices[0]?.message?.content?.trim() || '';
    res.json({ description });
  } catch (e) {
    if (e.status === 401) return res.status(500).json({ error: 'API key ไม่ถูกต้อง กรุณาตรวจสอบ GROQ_API_KEY' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ai/price-suggest — วิเคราะห์ราคาตลาดจาก DB
router.get('/price-suggest', authMiddleware, async (req, res) => {
  try {
    const { category, condition } = req.query;
    if (!category) return res.status(400).json({ error: 'กรุณาระบุหมวดหมู่' });

    const db = getDB();

    const params = [category];
    let condFilter = '';
    if (condition) { condFilter = ' AND condition = $2'; params.push(condition); }

    const { rows } = await db.query(`
      SELECT price, condition, title
      FROM products
      WHERE category = $1${condFilter}
        AND status IN ('available', 'sold')
        AND price > 0
      ORDER BY created_at DESC
      LIMIT 50
    `, params);

    if (rows.length === 0) {
      return res.json({ count: 0, message: 'ยังไม่มีข้อมูลราคาในหมวดนี้' });
    }

    const prices = rows.map(r => r.price).sort((a, b) => a - b);
    const min = prices[0];
    const max = prices[prices.length - 1];
    const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
    const median = prices[Math.floor(prices.length / 2)];

    let suggested = avg;
    if (['มือหนึ่ง (ใหม่)', 'เหมือนใหม่'].includes(condition)) suggested = Math.round(avg * 1.15);
    else if (condition === 'สภาพดี') suggested = Math.round(avg * 1.0);
    else if (condition === 'สภาพพอใช้') suggested = Math.round(avg * 0.8);
    else if (condition === 'ต้องซ่อม') suggested = Math.round(avg * 0.5);

    res.json({
      count: rows.length,
      min, max, avg, median,
      suggested,
      samples: rows.slice(0, 5).map(r => ({ title: r.title, price: r.price, condition: r.condition }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/image-search — ค้นหาสินค้าด้วยรูปภาพ (Groq Vision)
router.post('/image-search', authMiddleware, (req, res) => {
  imgSearchUpload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'กรุณาแนบรูปภาพ' });

      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      const ai = getAI();

      const completion = await ai.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            { type: 'text', text: 'วิเคราะห์รูปภาพนี้แล้วสกัดคำค้นหาสำหรับสินค้า ให้ตอบเป็น JSON: {"keywords": "...", "category": "..."} โดย category ต้องเป็นหนึ่งใน: มือถือ, เสื้อผ้า, หนังสือ, กีฬา, ของแต่งบ้าน, กล้อง หรือ null' }
          ]
        }]
      });

      const text = completion.choices[0]?.message?.content?.trim() || '';
      let keywords = '';
      let category = null;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          keywords = parsed.keywords || '';
          category = parsed.category || null;
        }
      } catch {
        keywords = text;
      }

      const db = getDB();
      const kwList = keywords.split(/[\s,]+/).filter(k => k.length > 1);
      let products = [];
      if (kwList.length > 0) {
        const conditions = kwList.map((kw, i) => `(title ILIKE $${i+1} OR description ILIKE $${i+1})`).join(' OR ');
        const params = kwList.map(kw => `%${kw}%`);
        const catFilter = category ? ` AND category = $${params.length + 1}` : '';
        if (category) params.push(category);
        const { rows } = await db.query(
          `SELECT id, title, price, category, condition, image_url, location, status FROM products WHERE (${conditions})${catFilter} AND status = 'available' LIMIT 20`,
          params
        );
        products = rows;
      }

      res.json({ keywords, category, products });
    } catch (e) {
      if (e.status === 401) return res.status(500).json({ error: 'API key ไม่ถูกต้อง' });
      res.status(500).json({ error: e.message });
    }
  });
});

module.exports = router;
