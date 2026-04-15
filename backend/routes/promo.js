const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/promo/my — get seller's own promo codes
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM promo_codes WHERE seller_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/promo/check — check promo code validity (public)
router.post('/check', async (req, res) => {
  try {
    const { code, seller_id, total } = req.body;
    if (!code || !seller_id) {
      return res.status(400).json({ error: 'กรุณาระบุโค้ดและผู้ขาย' });
    }

    const { rows } = await getDB().query(
      'SELECT * FROM promo_codes WHERE code = $1 AND seller_id = $2',
      [code.trim().toUpperCase(), seller_id]
    );

    if (!rows[0]) {
      return res.json({ valid: false, message: 'ไม่พบโค้ดส่วนลด' });
    }

    const promo = rows[0];

    if (!promo.is_active) {
      return res.json({ valid: false, message: 'โค้ดนี้ถูกปิดใช้งานแล้ว' });
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return res.json({ valid: false, message: 'โค้ดนี้หมดอายุแล้ว' });
    }
    if (promo.uses_limit !== null && promo.uses_count >= promo.uses_limit) {
      return res.json({ valid: false, message: 'โค้ดนี้ถูกใช้ครบแล้ว' });
    }

    const orderTotal = Number(total) || 0;
    if (orderTotal < promo.min_order) {
      return res.json({
        valid: false,
        message: `ยอดขั้นต่ำ ฿${promo.min_order.toLocaleString()}`
      });
    }

    let discount_amount = 0;
    if (promo.discount_type === 'percent') {
      discount_amount = (orderTotal * promo.discount_value) / 100;
    } else {
      discount_amount = promo.discount_value;
    }
    discount_amount = Math.min(discount_amount, orderTotal);

    res.json({
      valid: true,
      discount_amount: parseFloat(discount_amount.toFixed(2)),
      message: `ส่วนลด ${promo.discount_type === 'percent' ? promo.discount_value + '%' : '฿' + promo.discount_value}`,
      promo
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/promo — create promo code
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, discount_type, discount_value, min_order, uses_limit, expires_at } = req.body;
    if (!code || !discount_value) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    if (!['percent', 'fixed'].includes(discount_type)) {
      return res.status(400).json({ error: 'ประเภทส่วนลดต้องเป็น percent หรือ fixed' });
    }

    const { rows } = await getDB().query(
      `INSERT INTO promo_codes (seller_id, code, discount_type, discount_value, min_order, uses_limit, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.user.id,
        code.trim().toUpperCase(),
        discount_type || 'percent',
        Number(discount_value),
        Number(min_order) || 0,
        uses_limit || null,
        expires_at || null
      ]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'คุณมีโค้ดนี้แล้ว' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/promo/:id/toggle — toggle is_active
router.patch('/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query(
      'SELECT * FROM promo_codes WHERE id = $1 AND seller_id = $2',
      [req.params.id, req.user.id]
    );
    if (!pr[0]) return res.status(404).json({ error: 'ไม่พบโปรโมชัน' });
    await db.query(
      'UPDATE promo_codes SET is_active = $1 WHERE id = $2',
      [pr[0].is_active ? 0 : 1, req.params.id]
    );
    res.json({ message: pr[0].is_active ? 'ปิดใช้งานโค้ดแล้ว' : 'เปิดใช้งานโค้ดแล้ว', is_active: !pr[0].is_active });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/promo/:id — delete promo code
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query(
      'SELECT * FROM promo_codes WHERE id = $1 AND seller_id = $2',
      [req.params.id, req.user.id]
    );
    if (!pr[0]) return res.status(404).json({ error: 'ไม่พบโปรโมชัน' });
    await db.query('DELETE FROM promo_codes WHERE id = $1', [req.params.id]);
    res.json({ message: 'ลบโปรโมชันแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
