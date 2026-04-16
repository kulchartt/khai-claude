const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// GET /api/bundles — all active bundles
router.get('/', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT b.*, u.name as seller_name, u.avatar as seller_avatar
       FROM bundles b JOIN users u ON b.seller_id = u.id
       WHERE b.is_active = 1 ORDER BY b.created_at DESC LIMIT 10`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/bundles/seller/:id
router.get('/seller/:id', async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT * FROM bundles WHERE seller_id=$1 AND is_active=1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/bundles/:id — bundle detail with product info
router.get('/:id', async (req, res) => {
  try {
    const db = getDB();
    const { rows: br } = await db.query(
      `SELECT b.*, u.name as seller_name FROM bundles b JOIN users u ON b.seller_id=u.id WHERE b.id=$1`,
      [req.params.id]
    );
    if (!br[0]) return res.status(404).json({ error: 'ไม่พบ Bundle' });
    const bundle = br[0];
    const productIds = JSON.parse(bundle.product_ids);
    const { rows: products } = await db.query(
      'SELECT id, title, price, image_url, condition FROM products WHERE id = ANY($1)',
      [productIds]
    );
    bundle.products = products;
    bundle.total_original = products.reduce((s, p) => s + Number(p.price), 0);
    res.json(bundle);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/bundles — create bundle
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, product_ids, bundle_price } = req.body;
    if (!title || !product_ids || !bundle_price) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
    if (!Array.isArray(product_ids) || product_ids.length < 2 || product_ids.length > 5)
      return res.status(400).json({ error: 'Bundle ต้องมี 2-5 สินค้า' });
    const db = getDB();
    const { rows: prods } = await db.query(
      "SELECT id, price FROM products WHERE id = ANY($1) AND seller_id=$2 AND status='available'",
      [product_ids, req.user.id]
    );
    if (prods.length !== product_ids.length) return res.status(400).json({ error: 'สินค้าบางชิ้นไม่ใช่ของคุณหรือไม่ได้วางขาย' });
    const totalPrice = prods.reduce((s, p) => s + Number(p.price), 0);
    if (Number(bundle_price) >= totalPrice) return res.status(400).json({ error: `ราคา Bundle ต้องน้อยกว่าราคารวม (฿${totalPrice.toLocaleString()})` });
    const { rows } = await db.query(
      'INSERT INTO bundles (seller_id, title, product_ids, bundle_price) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.user.id, title, JSON.stringify(product_ids), Number(bundle_price)]
    );
    res.json({ id: rows[0].id, message: 'สร้าง Bundle แล้ว! 🎁' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/bundles/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query('SELECT seller_id FROM bundles WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบ Bundle' });
    if (rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    await db.query('DELETE FROM bundles WHERE id=$1', [req.params.id]);
    res.json({ message: 'ลบ Bundle แล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
