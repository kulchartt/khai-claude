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
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'));
}});

router.get('/', (req, res) => {
  const db = getDB();
  const { cat, q, minPrice, maxPrice, sort, condition, page = 1, limit = 20 } = req.query;
  let sql = `SELECT p.*, u.name as seller_name, u.rating as seller_rating FROM products p JOIN users u ON p.seller_id = u.id WHERE p.status = 'available'`;
  const params = [];
  if (cat && cat !== 'ทั้งหมด') { sql += ' AND p.category = ?'; params.push(cat); }
  if (q) { sql += ' AND (p.title LIKE ? OR p.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (minPrice) { sql += ' AND p.price >= ?'; params.push(Number(minPrice)); }
  if (maxPrice) { sql += ' AND p.price <= ?'; params.push(Number(maxPrice)); }
  if (condition) { sql += ' AND p.condition = ?'; params.push(condition); }
  if (sort === 'price-asc') sql += ' ORDER BY p.price ASC';
  else if (sort === 'price-desc') sql += ' ORDER BY p.price DESC';
  else sql += ' ORDER BY p.created_at DESC';
  sql += ` LIMIT ? OFFSET ?`;
  params.push(Number(limit), (Number(page) - 1) * Number(limit));
  const products = db.prepare(sql).all(...params);
  res.json(products);
});

router.get('/:id', (req, res) => {
  const db = getDB();
  const product = db.prepare(`SELECT p.*, u.name as seller_name, u.email as seller_email, u.rating as seller_rating, u.review_count as seller_reviews FROM products p JOIN users u ON p.seller_id = u.id WHERE p.id = ?`).get(req.params.id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC').all(req.params.id);
  product.images = images;
  res.json(product);
});

router.post('/', authMiddleware, upload.array('images', 10), (req, res) => {
  const { title, price, category, condition, description, location } = req.body;
  if (!title || !price || !category) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  const db = getDB();
  const firstImage = req.files && req.files.length > 0 ? `/uploads/${req.files[0].filename}` : '';
  const result = db.prepare(`INSERT INTO products (title, price, category, condition, description, location, image_url, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(title, Number(price), category, condition || 'สภาพดี', description || '', location || '', firstImage, req.user.id);
  const productId = result.lastInsertRowid;
  if (req.files && req.files.length > 0) {
    const insertImg = db.prepare('INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)');
    req.files.forEach((file, i) => insertImg.run(productId, `/uploads/${file.filename}`, i));
  }
  res.json({ id: productId, message: 'ลงขายสินค้าสำเร็จ!' });
});

router.put('/:id', authMiddleware, upload.array('images', 10), (req, res) => {
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไข' });
  const { title, price, category, condition, description, location, status } = req.body;
  let firstImage = product.image_url;
  if (req.files && req.files.length > 0) {
    firstImage = `/uploads/${req.files[0].filename}`;
    const insertImg = db.prepare('INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)');
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM product_images WHERE product_id = ?').get(req.params.id).m || 0;
    req.files.forEach((file, i) => insertImg.run(req.params.id, `/uploads/${file.filename}`, maxOrder + i + 1));
  }
  db.prepare(`UPDATE products SET title=?, price=?, category=?, condition=?, description=?, location=?, image_url=?, status=? WHERE id=?`).run(title||product.title, price?Number(price):product.price, category||product.category, condition||product.condition, description!==undefined?description:product.description, location!==undefined?location:product.location, firstImage, status||product.status, req.params.id);
  res.json({ message: 'อัปเดตสินค้าแล้ว' });
});

router.delete('/:id/images/:imageId', authMiddleware, (req, res) => {
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product || product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const img = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(req.params.imageId, req.params.id);
  if (!img) return res.status(404).json({ error: 'ไม่พบรูปภาพ' });
  const filePath = path.join(__dirname, '..', img.url);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM product_images WHERE id = ?').run(req.params.imageId);
  res.json({ message: 'ลบรูปแล้ว' });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบ' });
  db.prepare('DELETE FROM product_images WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ message: 'ลบสินค้าแล้ว' });
});

module.exports = router;
