const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ─── POST /api/analytics/event ────────────────────────────────────────────────
// Log a product event (view, wishlist, chat_open, offer, share)
// No auth required — but user_id captured when logged in
router.post('/event', async (req, res) => {
  try {
    const { product_id, event_type } = req.body;
    if (!product_id || !event_type) return res.status(400).json({ error: 'Missing fields' });
    const valid = ['view', 'wishlist', 'chat_open', 'offer', 'share'];
    if (!valid.includes(event_type)) return res.status(400).json({ error: 'Invalid event_type' });

    // Resolve user_id from token if present (optional auth)
    let userId = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'secret');
        userId = payload.id ?? payload.userId ?? null;
      } catch {}
    }

    const db = getDB();
    await db.query(
      `INSERT INTO product_events (product_id, event_type, user_id) VALUES ($1, $2, $3)`,
      [product_id, event_type, userId]
    );

    // Also increment view_count on products table for quick access
    if (event_type === 'view') {
      await db.query(`UPDATE products SET view_count = COALESCE(view_count,0) + 1 WHERE id = $1`, [product_id]);
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/analytics/seller ────────────────────────────────────────────────
// Returns seller's products with event counts + days listed
router.get('/seller', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: products } = await db.query(
      `SELECT id, title, price, status, image_url, created_at,
        COALESCE(view_count,0) AS view_count,
        EXTRACT(DAY FROM NOW() - created_at)::int AS days_listed,
        (SELECT COUNT(*) FROM jsonb_array_elements_text(
          CASE WHEN image_url IS NOT NULL AND image_url != ''
               THEN to_jsonb(ARRAY[image_url]) ELSE '[]'::jsonb END
        )) AS image_count,
        LENGTH(COALESCE(description,'')) AS desc_length
       FROM products WHERE seller_id = $1 AND status != 'deleted'
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    if (products.length === 0) return res.json([]);

    const productIds = products.map(p => p.id);

    // Get event counts per product in one query
    const { rows: events } = await db.query(
      `SELECT product_id, event_type, COUNT(*)::int AS cnt
       FROM product_events
       WHERE product_id = ANY($1)
       GROUP BY product_id, event_type`,
      [productIds]
    );

    // Get offer counts per product
    const { rows: offers } = await db.query(
      `SELECT product_id, COUNT(*)::int AS cnt FROM offers
       WHERE product_id = ANY($1) GROUP BY product_id`,
      [productIds]
    );

    // Build lookup maps
    const eventMap = {};
    for (const e of events) {
      if (!eventMap[e.product_id]) eventMap[e.product_id] = {};
      eventMap[e.product_id][e.event_type] = e.cnt;
    }
    const offerMap = {};
    for (const o of offers) offerMap[o.product_id] = o.cnt;

    const result = products.map(p => ({
      ...p,
      views:      eventMap[p.id]?.view || 0,
      wishlists:  eventMap[p.id]?.wishlist || 0,
      chat_opens: eventMap[p.id]?.chat_open || 0,
      offers:     offerMap[p.id] || 0,
      shares:     eventMap[p.id]?.share || 0,
    }));

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/analytics/recommendations/:productId ────────────────────────────
// Returns actionable recommendations for a specific product
router.get('/recommendations/:productId', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: [product] } = await db.query(
      `SELECT p.id, p.title, p.price, p.status, p.image_url, p.description,
        p.created_at, p.seller_id,
        COALESCE(p.view_count,0) AS view_count,
        EXTRACT(DAY FROM NOW() - p.created_at)::int AS days_listed,
        LENGTH(COALESCE(p.description,'')) AS desc_length,
        -- Count comma-separated images or single image
        CASE WHEN p.image_url IS NULL OR p.image_url = '' THEN 0 ELSE 1 END AS image_count
       FROM products p WHERE p.id = $1`,
      [req.params.productId]
    );

    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    // Get event counts
    const { rows: events } = await db.query(
      `SELECT event_type, COUNT(*)::int AS cnt FROM product_events
       WHERE product_id = $1 GROUP BY event_type`,
      [req.params.productId]
    );
    const ev = {};
    for (const e of events) ev[e.event_type] = e.cnt;

    const { rows: [offerRow] } = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM offers WHERE product_id = $1`,
      [req.params.productId]
    );

    const views      = ev.view || 0;
    const wishlists  = ev.wishlist || 0;
    const chatOpens  = ev.chat_open || 0;
    const offerCount = offerRow?.cnt || 0;
    const days       = product.days_listed || 0;
    const descLen    = product.desc_length || 0;
    const imgCount   = product.image_count || 0;

    const recs = [];

    // Rule 1: Low visibility
    if (days >= 7 && views < 20) {
      recs.push({
        severity: 'high',
        type: 'visibility',
        icon: '👁️',
        title: 'ยอดเข้าชมต่ำมาก',
        detail: `ใน ${days} วันที่ผ่านมา มีคนเห็นสินค้านี้เพียง ${views} ครั้ง`,
        actions: [
          'ปรับชื่อประกาศให้ตรงกับคำที่คนค้นหา',
          'ลองระบุรุ่น สี และสภาพให้ชัดเจนขึ้น',
          'ใช้ Boost เพื่อเพิ่มการมองเห็น 8-12x',
        ],
      });
    }

    // Rule 2: Seen but not saved
    if (views >= 20 && wishlists === 0) {
      recs.push({
        severity: 'high',
        type: 'attraction',
        icon: '🖼️',
        title: 'คนเห็นแต่ไม่สนใจ',
        detail: `${views} คนเห็น แต่ยังไม่มีใครบันทึกสินค้านี้ไว้`,
        actions: [
          'เปลี่ยนรูปหน้าปกให้น่าสนใจขึ้น (ภาพชัด แสงดี)',
          'ตรวจสอบว่าราคาสูงกว่าตลาดหรือไม่',
          'ระบุจุดเด่นสินค้าในชื่อประกาศ',
        ],
      });
    } else if (views >= 20 && wishlists > 0) {
      const wishlistRate = wishlists / views;
      if (wishlistRate < 0.03) {
        recs.push({
          severity: 'medium',
          type: 'attraction',
          icon: '💡',
          title: 'อัตราการบันทึกต่ำ',
          detail: `${views} คนเห็น → บันทึกเพียง ${wishlists} คน (${(wishlistRate*100).toFixed(1)}%)`,
          actions: [
            'ปรับรูปภาพให้ดึงดูดขึ้น — ภาพแรกสำคัญที่สุด',
            'ลองลดราคาเล็กน้อยเพื่อดึงความสนใจ',
          ],
        });
      }
    }

    // Rule 3: Saved but no chat
    if (wishlists >= 3 && chatOpens === 0) {
      recs.push({
        severity: 'medium',
        type: 'engagement',
        icon: '💬',
        title: 'มีคนบันทึกไว้แต่ยังไม่ถาม',
        detail: `${wishlists} คนบันทึกสินค้านี้ แต่ยังไม่มีใครเปิดแชท`,
        actions: [
          'เพิ่มรายละเอียดสินค้าให้ครบ — ทำให้ไม่ต้องถามแล้วตัดสินใจได้เลย',
          'ระบุวิธีส่ง/นัดรับ และนโยบายการคืนสินค้า',
          'บอกสภาพสินค้าจริงอย่างชัดเจน',
        ],
      });
    }

    // Rule 4: Chats but no offers
    if (chatOpens >= 2 && offerCount === 0 && days >= 14) {
      recs.push({
        severity: 'high',
        type: 'pricing',
        icon: '💰',
        title: 'มีคนถามแต่ไม่ยื่นราคา',
        detail: `${chatOpens} คนเปิดแชท แต่ไม่มีใครเสนอราคาในช่วง ${days} วัน`,
        actions: [
          'ราคาอาจสูงเกินไป — ลองลด 5-10% ดูก่อน',
          'เขียนในคำอธิบายว่า "ต่อรองได้" เพื่อให้คนกล้าเสนอ',
          'ระบุราคาต่ำสุดที่รับได้ในแชท',
        ],
      });
    }

    // Rule 5: Old listing
    if (days > 30 && product.status === 'available') {
      recs.push({
        severity: 'medium',
        type: 'freshness',
        icon: '📅',
        title: 'ประกาศเก่าเกินไป',
        detail: `สินค้านี้ลงประกาศมา ${days} วันแล้ว ระบบจะค่อยๆ ลดการแสดงผล`,
        actions: [
          'ลบแล้วลงประกาศใหม่เพื่อกลับขึ้นหน้าแรก',
          'หรือใช้ Boost เพื่อฟื้นฟูการมองเห็น',
          'อัปเดตราคาแม้เพียงเล็กน้อย ก็ช่วยได้',
        ],
      });
    }

    // Rule 6: Missing/few images
    if (imgCount < 2) {
      recs.push({
        severity: 'high',
        type: 'images',
        icon: '📸',
        title: 'รูปภาพน้อยเกินไป',
        detail: 'สินค้าที่มีรูป 3+ รูป ขายได้เร็วกว่าสินค้ารูปเดียวถึง 3 เท่า',
        actions: [
          'ถ่ายรูปจากหลายมุม: ด้านหน้า ด้านหลัง ด้านข้าง รายละเอียด',
          'ถ่ายรูปตำหนิ (ถ้ามี) เพื่อสร้างความน่าเชื่อถือ',
          'ใช้แสงธรรมชาติหรือกล่องถ่ายภาพเพื่อความชัดเจน',
        ],
      });
    }

    // Rule 7: Short description
    if (descLen < 50) {
      recs.push({
        severity: 'medium',
        type: 'description',
        icon: '📝',
        title: 'คำอธิบายสั้นเกินไป',
        detail: `คำอธิบายปัจจุบัน: ${descLen} ตัวอักษร (แนะนำ 100+ ตัวอักษร)`,
        actions: [
          'ระบุสภาพสินค้า อายุการใช้งาน และเหตุผลที่ขาย',
          'บอกอุปกรณ์ที่แถมมา (กล่อง ใบรับประกัน สายชาร์จ ฯลฯ)',
          'ระบุวิธีรับสินค้า และพื้นที่ที่สะดวกนัดรับ',
        ],
      });
    }

    // No issues
    if (recs.length === 0 && views > 0) {
      recs.push({
        severity: 'good',
        type: 'healthy',
        icon: '✅',
        title: 'สินค้านี้อยู่ในเกณฑ์ดี',
        detail: `${views} เข้าชม · ${wishlists} บันทึก · ${chatOpens} แชท · ${offerCount} ข้อเสนอ`,
        actions: ['รอรับคำเสนอซื้อได้เลย! หรือ Boost เพื่อขายเร็วขึ้น'],
      });
    }

    res.json({
      product_id: product.id,
      stats: { views, wishlists, chat_opens: chatOpens, offers: offerCount, days },
      recommendations: recs,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
