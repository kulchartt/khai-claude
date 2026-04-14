const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'));
  }
});

function uploadMiddleware(req, res, next) {
  upload.array('images', 10)(req, res, (err) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: `อัปโหลดไม่สำเร็จ: ${err.message}` });
    else if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const { cat, q, minPrice, maxPrice, sort, condition, page = 1, limit = 20 } = req.query;
    let sql = `SELECT p.*, u.name as seller_name, u.rating as seller_rating FROM products p JOIN users u ON p.seller_id = u.id WHERE p.status = 'available'`;
    const params = [];
    let n = 0;
    const p = () => `$${++n}`;
    if (cat && cat !== 'ทั้งหมด') { sql += ` AND p.category = ${p()}`; params.push(cat); }
    if (q) { sql += ` AND (p.title ILIKE ${p()} OR p.description ILIKE ${p()})`; params.push(`%${q}%`, `%${q}%`); }
    if (minPrice) { sql += ` AND p.price >= ${p()}`; params.push(Number(minPrice)); }
    if (maxPrice) { sql += ` AND p.price <= ${p()}`; params.push(Number(maxPrice)); }
    if (condition) { sql += ` AND p.condition = ${p()}`; params.push(condition); }
    if (sort === 'price-asc') sql += ' ORDER BY p.price ASC';
    else if (sort === 'price-desc') sql += ' ORDER BY p.price DESC';
    else sql += ' ORDER BY p.created_at DESC';
    sql += ` LIMIT ${p()} OFFSET ${p()}`;
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query(`
      SELECT p.*, u.name as seller_name, u.email as seller_email,
             u.rating as seller_rating, u.review_count as seller_reviews
      FROM products p JOIN users u ON p.seller_id = u.id WHERE p.id = $1
    `, [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    const { rows: images } = await db.query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC', [req.params.id]);
    product.images = images;
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, uploadMiddleware, async (req, res) => {
  try {
    const { title, price, category, condition, description, location } = req.body;
    if (!title || !price || !category) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    const db = getDB();
    const firstImage = req.files && req.files.length > 0 ? `/uploads/${req.files[0].filename}` : '';
    const { rows } = await db.query(
      'INSERT INTO products (title,price,category,condition,description,location,image_url,seller_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [title, Number(price), category, condition || 'สภาพดี', description || '', location || '', firstImage, req.user.id]
    );
    const productId = rows[0].id;
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        await db.query('INSERT INTO product_images (product_id, url, sort_order) VALUES ($1,$2,$3)', [productId, `/uploads/${req.files[i].filename}`, i]);
      }
    }
    res.json({ id: productId, message: 'ลงขายสินค้าสำเร็จ!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, uploadMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไข' });
    const { title, price, category, condition, description, location, status } = req.body;
    let firstImage = product.image_url;
    if (req.files && req.files.length > 0) {
      firstImage = `/uploads/${req.files[0].filename}`;
      const { rows: mo } = await db.query('SELECT MAX(sort_order) as m FROM product_images WHERE product_id = $1', [req.params.id]);
      const maxOrder = mo[0].m || 0;
      for (let i = 0; i < req.files.length; i++) {
        await db.query('INSERT INTO product_images (product_id, url, sort_order) VALUES ($1,$2,$3)', [req.params.id, `/uploads/${req.files[i].filename}`, maxOrder + i + 1]);
      }
    }
    await db.query(
      'UPDATE products SET title=$1,price=$2,category=$3,condition=$4,description=$5,location=$6,image_url=$7,status=$8 WHERE id=$9',
      [title||product.title, price?Number(price):product.price, category||product.category, condition||product.condition,
       description!==undefined?description:product.description, location!==undefined?location:product.location,
       firstImage, status||product.status, req.params.id]
    );
    res.json({ message: 'อัปเดตสินค้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/images/:imageId', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = pr[0];
    if (!product || product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    const { rows: ir } = await db.query('SELECT * FROM product_images WHERE id = $1 AND product_id = $2', [req.params.imageId, req.params.id]);
    const img = ir[0];
    if (!img) return res.status(404).json({ error: 'ไม่พบรูปภาพ' });
    const filePath = path.join(__dirname, '..', img.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.query('DELETE FROM product_images WHERE id = $1', [req.params.imageId]);
    res.json({ message: 'ลบรูปแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบ' });
    await db.query('DELETE FROM product_images WHERE product_id = $1', [req.params.id]);
    await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ message: 'ลบสินค้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
