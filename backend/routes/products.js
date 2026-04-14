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
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', (req, res) => {
  const db = getDB();
  const { cat, q, minPrice, maxPrice, sort, page = 1, limit = 20 } = req.query;
  let sql = `
    SELECT p.*, u.name as seller_name, u.rating as seller_rating
    FROM products p JOIN users u ON p.seller_id = u.id
    WHERE p.status = 'available'
  `;
  const params = [];
  if (cat && cat !== 'ทั้งหมด') { sql += ' AND p.category = ?'; params.push(cat); }
  if (q) { sql += ' AND (p.title LIKE ? OR p.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (minPrice) { sql += ' AND p.price >= ?'; params.push(Number(minPrice)); }
  if (maxPrice) { sql += ' AND p.price <= ?'; params.push(Number(maxPrice)); }

  if (sort === 'price-asc') sql += ' ORDER BY p.price ASC';
  else if (sort === 'price-desc') sql += ' ORDER BY p.price DESC';
  else sql += ' ORDER BY p.created_at DESC';

  const offset = (Number(page) - 1) * Number(limit);
  sql += ` LIMIT ? OFFSET ?`;
  params.push(Number(limit), offset);

  const products = db.prepare(sql).all(...params);
  res.json(products);
});

router.get('/:id', (req, res) => {
  const db = getDB();
  const product = db.prepare(`
    SELECT p.*, u.name as seller_name, u.email as seller_email, u.rating as seller_rating, u.review_count as seller_reviews
    FROM products p JOIN users u ON p.seller_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  res.json(product);
});

router.post('/', authMiddleware, upload.single('image'), (req, res) => {
  const { title, price, category, condition, description, location } = req.body;
  if (!title || !price || !category) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });

  const db = getDB();
  const image_url = req.file ? `/uploads/${req.file.filename}` : '';
  const result = db.prepare(`
    INSERT INTO products (title, price, category, condition, description, location, image_url, seller_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, Number(price), category, condition || 'สภาพดี', description || '', location || '', image_url, req.user.id);

  res.json({ id: result.lastInsertRowid, message: 'ลงขายสินค้าสำเร็จ!' });
});

router.put('/:id', authMiddleware, upload.single('image'), (req, res) => {
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขสินค้านี้' });

  const { title, price, category, condition, description, location, status } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : product.image_url;

  db.prepare(`
    UPDATE products SET title=?, price=?, category=?, condition=?, description=?, location=?, image_url=?, status=?
    WHERE id=?
  `).run(
    title || product.title,
    price ? Number(price) : product.price,
    category || product.category,
    condition || product.condition,
    description !== undefined ? description : product.description,
    location !== undefined ? location : product.location,
    image_url,
    status || product.status,
    req.params.id
  );
  res.json({ message: 'อัปเดตสินค้าแล้ว' });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบสินค้านี้' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ message: 'ลบสินค้าแล้ว' });
});

module.exports = router;
