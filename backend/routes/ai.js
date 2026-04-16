const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const getAI = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/ai/description — AI ช่วยเขียนรายละเอียดสินค้า
router.post('/description', authMiddleware, async (req, res) => {
  try {
    const { title, category, condition, existing } = req.body;
    if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อสินค้า' });

    const ai = getAI();
    const msg = await ai.messages.create({
      model: 'claude-3-5-haiku-20241022',
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

    const description = msg.content[0]?.text?.trim() || '';
    res.json({ description });
  } catch (e) {
    if (e.status === 401) return res.status(500).json({ error: 'API key ไม่ถูกต้อง กรุณาตรวจสอบ ANTHROPIC_API_KEY' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ai/price-suggest — วิเคราะห์ราคาตลาดจาก DB
router.get('/price-suggest', authMiddleware, async (req, res) => {
  try {
    const { category, condition, title } = req.query;
    if (!category) return res.status(400).json({ error: 'กรุณาระบุหมวดหมู่' });

    const db = getDB();

    // ดึงราคาสินค้าใน category เดียวกัน (สถานะ available หรือ sold)
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

    // แนะนำราคาตามสภาพ
    let suggested = avg;
    if (condition === 'มือสองใหม่') suggested = Math.round(avg * 1.1);
    else if (condition === 'สภาพดี') suggested = avg;
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

module.exports = router;
