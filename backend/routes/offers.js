const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ผู้ซื้อส่งข้อเสนอราคา
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { product_id, offer_price, message } = req.body;
    if (!product_id || !offer_price) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    const db = getDB();

    // ดึงข้อมูลสินค้าและผู้ขาย
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [product_id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถเสนอราคาสินค้าของตัวเองได้' });
    if (product.status !== 'available') return res.status(400).json({ error: 'สินค้านี้ไม่ว่างแล้ว' });
    const { rows: blk } = await db.query(
      'SELECT 1 FROM blocked_users WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
      [req.user.id, product.seller_id]
    );
    if (blk.length) return res.status(403).json({ error: 'ไม่สามารถเสนอราคาได้' });

    // สร้าง offer
    const { rows } = await db.query(
      `INSERT INTO offers (product_id, buyer_id, seller_id, offer_price, message)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [product_id, req.user.id, product.seller_id, Number(offer_price), message || '']
    );

    // แจ้งเตือนผู้ขาย
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1,'offer','มีข้อเสนอราคาใหม่',$2,$3)`,
      [product.seller_id,
       `${req.user.name} เสนอ ฿${Number(offer_price).toLocaleString()} สำหรับ "${product.title}"`,
       `/offers`]
    );

    // ส่ง socket notification ถ้า seller online
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    const sellerSocket = onlineUsers?.get(product.seller_id);
    if (sellerSocket) io.to(sellerSocket).emit('notification', { type: 'offer' });

    res.json({ id: rows[0].id, message: 'ส่งข้อเสนอแล้ว! รอผู้ขายตอบกลับ 🤝' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ดูข้อเสนอที่ได้รับ (ผู้ขาย)
router.get('/incoming', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query(`
      SELECT o.*, p.title as product_title, p.price as product_price, p.image_url,
             u.name as buyer_name, u.avatar as buyer_avatar
      FROM offers o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = $1
      ORDER BY o.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ดูข้อเสนอที่ส่งไป (ผู้ซื้อ)
router.get('/outgoing', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query(`
      SELECT o.*, p.title as product_title, p.price as product_price, p.image_url,
             u.name as seller_name
      FROM offers o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.seller_id = u.id
      WHERE o.buyer_id = $1
      ORDER BY o.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ผู้ขายตอบกลับ (accept / decline)
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' | 'declined'
    if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'status ไม่ถูกต้อง' });
    const db = getDB();

    const { rows: or } = await db.query(
      'SELECT o.*, p.title as product_title FROM offers o JOIN products p ON o.product_id = p.id WHERE o.id = $1',
      [req.params.id]
    );
    const offer = or[0];
    if (!offer) return res.status(404).json({ error: 'ไม่พบข้อเสนอ' });
    if (offer.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'ข้อเสนอนี้ตอบกลับไปแล้ว' });

    await db.query('UPDATE offers SET status = $1 WHERE id = $2', [status, req.params.id]);

    // แจ้งเตือนผู้ซื้อ
    const isAccepted = status === 'accepted';
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1,'offer',$2,$3,$4)`,
      [offer.buyer_id,
       isAccepted ? '✅ ข้อเสนอได้รับการยอมรับ!' : '❌ ข้อเสนอถูกปฏิเสธ',
       isAccepted
         ? `ผู้ขายยอมรับราคา ฿${Number(offer.offer_price).toLocaleString()} สำหรับ "${offer.product_title}"`
         : `ผู้ขายปฏิเสธข้อเสนอสำหรับ "${offer.product_title}"`,
       `/product/${offer.product_id}`]
    );

    // socket notification
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    const buyerSocket = onlineUsers?.get(offer.buyer_id);
    if (buyerSocket) io.to(buyerSocket).emit('notification', { type: 'offer' });

    res.json({ message: isAccepted ? 'ยอมรับข้อเสนอแล้ว ✅' : 'ปฏิเสธข้อเสนอแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
