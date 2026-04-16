const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCloudinary } = require('../cloudinary');

const router = express.Router();

// Use memory storage — files go straight to Cloudinary, not disk
const upload = multer({
  storage: multer.memoryStorage(),
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
    const { cat, q, minPrice, maxPrice, sort, condition, location, page = 1, limit = 20 } = req.query;
    let sql = `SELECT p.*, u.name as seller_name, u.rating as seller_rating FROM products p JOIN users u ON p.seller_id = u.id WHERE p.status IN ('available','reserved') AND p.is_draft = 0 AND (p.publish_at IS NULL OR p.publish_at <= NOW())`;
    const params = [];
    let n = 0;
    const p = () => `$${++n}`;
    if (cat && cat !== 'ทั้งหมด') { sql += ` AND p.category = ${p()}`; params.push(cat); }
    if (q) { sql += ` AND (p.title ILIKE ${p()} OR p.description ILIKE ${p()})`; params.push(`%${q}%`, `%${q}%`); }
    if (minPrice) { sql += ` AND p.price >= ${p()}`; params.push(Number(minPrice)); }
    if (maxPrice) { sql += ` AND p.price <= ${p()}`; params.push(Number(maxPrice)); }
    if (condition) { sql += ` AND p.condition = ${p()}`; params.push(condition); }
    if (location) { sql += ` AND p.location ILIKE ${p()}`; params.push(`%${location}%`); }
    if (sort === 'price-asc') sql += ' ORDER BY p.price ASC';
    else if (sort === 'price-desc') sql += ' ORDER BY p.price DESC';
    else sql += ' ORDER BY GREATEST(p.created_at, COALESCE(p.bumped_at, p.created_at)) DESC';
    sql += ` LIMIT ${p()} OFFSET ${p()}`;
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/trending', async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT p.*, u.name as seller_name, u.rating as seller_rating,
        COUNT(DISTINCT w.id)::int as wishlist_count,
        (COALESCE(p.view_count,0) + COUNT(DISTINCT w.id) * 3) as score
      FROM products p
      JOIN users u ON p.seller_id = u.id
      LEFT JOIN wishlist_items w ON w.product_id = p.id
      WHERE p.status = 'available'
      GROUP BY p.id, u.name, u.rating
      ORDER BY score DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query(`
      SELECT p.*, u.name as seller_name, u.email as seller_email,
             u.rating as seller_rating, u.review_count as seller_reviews, u.avatar as seller_avatar,
             u.holiday_mode as seller_holiday_mode
      FROM products p JOIN users u ON p.seller_id = u.id WHERE p.id = $1
    `, [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    const { rows: images } = await db.query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC', [req.params.id]);
    product.images = images;
    // เพิ่ม view_count (fire-and-forget)
    db.query('UPDATE products SET view_count = view_count + 1 WHERE id = $1', [req.params.id]).catch(() => {});
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, uploadMiddleware, async (req, res) => {
  try {
    const { title, price, category, condition, description, location, delivery_method, is_draft, publish_at, meetup_lat, meetup_lng, meetup_note } = req.body;
    if (!title || !price || !category) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    const db = getDB();

    // Upload all images to Cloudinary
    let firstImageUrl = '';
    const uploadedUrls = [];
    if (req.files && req.files.length > 0) {
      const uploadOptions = { folder: 'mueasong/products' };
      if (req.body.watermark === '1') {
        uploadOptions.transformation = [
          { overlay: { font_family: 'Arial', font_size: 13, font_weight: 'normal', text: 'PloiKhong' },
            gravity: 'south_east', x: 6, y: 6, opacity: 35, color: 'white' }
        ];
      }
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, uploadOptions);
        uploadedUrls.push(result.secure_url);
      }
      firstImageUrl = uploadedUrls[0];
    }

    const { rows } = await db.query(
      'INSERT INTO products (title,price,category,condition,description,location,image_url,seller_id,delivery_method,is_draft,publish_at,meetup_lat,meetup_lng,meetup_note,watermark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id',
      [title, Number(price), category, condition || 'สภาพดี', description || '', location || '', firstImageUrl, req.user.id, delivery_method || 'both', is_draft ? 1 : 0, publish_at || null, meetup_lat || null, meetup_lng || null, meetup_note || null, req.body.watermark === '1' ? 1 : 0]
    );
    const productId = rows[0].id;

    for (let i = 0; i < uploadedUrls.length; i++) {
      await db.query('INSERT INTO product_images (product_id, url, sort_order) VALUES ($1,$2,$3)', [productId, uploadedUrls[i], i]);
    }

    // แจ้งเตือนผู้ติดตาม
    try {
      const { rows: followers } = await db.query(
        'SELECT follower_id FROM follows WHERE seller_id = $1', [req.user.id]
      );
      if (followers.length > 0) {
        const { rows: sellerRow } = await db.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
        const sellerName = sellerRow[0]?.name || 'ผู้ขาย';
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        for (const { follower_id } of followers) {
          await db.query(
            "INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'system','สินค้าใหม่จากคนที่คุณติดตาม 🛍️',$2)",
            [follower_id, `${sellerName} ลงขาย "${title}" ราคา ฿${Number(price).toLocaleString()}`]
          );
          const sock = onlineUsers?.get(follower_id);
          if (sock) io?.to(sock).emit('notification', { type: 'system' });
        }
      }
    } catch (notifErr) { console.error('follower notify error:', notifErr); }

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

    const { title, price, category, condition, description, location, status, delivery_method, meetup_lat, meetup_lng, meetup_note } = req.body;
    let firstImage = product.image_url;

    if (req.files && req.files.length > 0) {
      const { rows: mo } = await db.query('SELECT MAX(sort_order) as m FROM product_images WHERE product_id = $1', [req.params.id]);
      const maxOrder = mo[0].m || 0;
      for (let i = 0; i < req.files.length; i++) {
        const result = await uploadToCloudinary(req.files[i].buffer);
        const url = result.secure_url;
        if (i === 0 && !product.image_url) firstImage = url;
        if (i === 0) firstImage = url;
        await db.query('INSERT INTO product_images (product_id, url, sort_order) VALUES ($1,$2,$3)', [req.params.id, url, maxOrder + i + 1]);
      }
    }

    // คำนวณ original_price: ถ้าลดราคา ให้บันทึกราคาเดิม
    let newOriginalPrice = product.original_price;
    if (price) {
      const newPrice = Number(price);
      if (newPrice < product.price) {
        newOriginalPrice = product.price; // ราคาลด → บันทึกราคาเดิม
      } else if (product.original_price && newPrice >= product.original_price) {
        newOriginalPrice = null; // ราคากลับขึ้น → เคลียร์ badge
      }
    }

    await db.query(
      'UPDATE products SET title=$1,price=$2,category=$3,condition=$4,description=$5,location=$6,image_url=$7,status=$8,delivery_method=$9,original_price=$10,meetup_lat=$11,meetup_lng=$12,meetup_note=$13 WHERE id=$14',
      [title||product.title, price?Number(price):product.price, category||product.category, condition||product.condition,
       description!==undefined?description:product.description, location!==undefined?location:product.location,
       firstImage, status||product.status, delivery_method||product.delivery_method||'both', newOriginalPrice,
       meetup_lat!==undefined?meetup_lat:product.meetup_lat, meetup_lng!==undefined?meetup_lng:product.meetup_lng,
       meetup_note!==undefined?meetup_note:product.meetup_note, req.params.id]
    );

    // Price drop alert: notify wishlist users
    if (price && Number(price) < product.price) {
      try {
        const newP = Number(price), oldP = product.price;
        const { rows: wishers } = await db.query('SELECT user_id FROM wishlist_items WHERE product_id = $1', [req.params.id]);
        const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
        for (const { user_id } of wishers) {
          if (user_id === req.user.id) continue;
          await db.query(
            "INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'system','💰 ราคาลดแล้ว!',$2)",
            [user_id, `${title||product.title} ลดจาก ฿${Number(oldP).toLocaleString()} เป็น ฿${Number(newP).toLocaleString()}`]
          );
          const sock = onlineUsers?.get(user_id);
          if (sock) io?.to(sock).emit('notification', { type: 'system' });
        }
      } catch (notifErr) { console.error('price drop notify:', notifErr); }
    }

    res.json({ message: 'อัปเดตสินค้าแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/close', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    if (product.status === 'sold') return res.status(400).json({ error: 'สินค้านี้ขายไปแล้ว' });
    await db.query("UPDATE products SET status = 'sold' WHERE id = $1", [req.params.id]);
    res.json({ message: 'ปิดการขายแล้ว 🏷️ สินค้าถูกทำเครื่องหมายว่าขายแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/bump', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    if (product.status !== 'available') return res.status(400).json({ error: 'สินค้านี้ไม่ได้วางขาย' });

    // เช็คว่า bump ไปแล้วในวันนี้หรือเปล่า
    if (product.bumped_at) {
      const lastBump = new Date(product.bumped_at);
      const now = new Date();
      const sameDay = lastBump.toDateString() === now.toDateString();
      if (sameDay) {
        // คำนวณเวลาที่ bump ได้อีก (เที่ยงคืนวันถัดไป)
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const diff = tomorrow - now;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return res.status(400).json({ error: `ดันโพสต์ได้อีกครั้งใน ${h} ชม. ${m} นาที` });
      }
    }

    await db.query('UPDATE products SET bumped_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'ดันโพสต์ขึ้นบนสุดแล้ว! ⬆️' });
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
    // Delete from Cloudinary if it's a Cloudinary URL
    if (img.url && img.url.includes('cloudinary.com')) {
      const publicId = img.url.split('/').slice(-1)[0].split('.')[0];
      const { cloudinary } = require('../cloudinary');
      await cloudinary.uploader.destroy(`mueasong/${publicId}`).catch(() => {});
    }
    await db.query('DELETE FROM product_images WHERE id = $1', [req.params.imageId]);

    // อัปเดต image_url ของ product ให้ชี้ไปรูปแรกที่เหลือ
    const { rows: remaining } = await db.query(
      'SELECT url FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC LIMIT 1',
      [req.params.id]
    );
    const newMainUrl = remaining[0]?.url || '';
    await db.query('UPDATE products SET image_url = $1 WHERE id = $2', [newMainUrl, req.params.id]);

    res.json({ message: 'ลบรูปแล้ว', new_image_url: newMainUrl });
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

// ===== FLASH SALE =====
router.post('/:id/flash', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    const { flash_price, duration_hours } = req.body;
    if (!flash_price || !duration_hours) return res.status(400).json({ error: 'กรุณาระบุราคาและระยะเวลา' });
    if (Number(flash_price) >= product.price) return res.status(400).json({ error: 'ราคา Flash Sale ต้องน้อยกว่าราคาปัจจุบัน' });
    const flash_end = new Date(Date.now() + Number(duration_hours) * 3600 * 1000);
    await db.query('UPDATE products SET flash_price=$1, flash_end=$2 WHERE id=$3', [Number(flash_price), flash_end, req.params.id]);
    res.json({ message: 'เปิด Flash Sale แล้ว! ⚡' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/flash', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query('SELECT seller_id FROM products WHERE id = $1', [req.params.id]);
    if (!pr[0]) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (pr[0].seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    await db.query('UPDATE products SET flash_price=NULL, flash_end=NULL WHERE id=$1', [req.params.id]);
    res.json({ message: 'ยกเลิก Flash Sale แล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== RESERVE =====
router.post('/:id/reserve', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถจองสินค้าของตัวเองได้' });
    if (product.status !== 'available') return res.status(400).json({ error: 'สินค้านี้ไม่พร้อมจอง' });
    await db.query("UPDATE products SET status='reserved', reserved_for_id=$1 WHERE id=$2", [req.user.id, req.params.id]);
    const { rows: buyerRow } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
    const buyerName = buyerRow[0]?.name || 'ผู้ซื้อ';
    await db.query("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','มีคนจองสินค้า 🔖',$2)",
      [product.seller_id, `${buyerName} ขอจอง "${product.title}"`]);
    const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
    const sock = onlineUsers?.get(product.seller_id);
    if (sock) io?.to(sock).emit('notification', { type: 'system' });
    res.json({ message: 'ส่งคำขอจองแล้ว! รอผู้ขายยืนยัน ⏳' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/reserve', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { action } = req.body;
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id=$1', [req.params.id]);
    const product = pr[0];
    if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    if (product.status !== 'reserved') return res.status(400).json({ error: 'สินค้านี้ไม่ได้ถูกจอง' });
    const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
    if (action === 'accept') {
      await db.query("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','การจองได้รับการยืนยัน ✅',$2)",
        [product.reserved_for_id, `ผู้ขายยืนยันการจอง "${product.title}" แล้ว!`]);
      const sock = onlineUsers?.get(product.reserved_for_id);
      if (sock) io?.to(sock).emit('notification', { type: 'system' });
      res.json({ message: 'ยืนยันการจองแล้ว ✅' });
    } else if (action === 'reject') {
      await db.query("UPDATE products SET status='available', reserved_for_id=NULL WHERE id=$1", [req.params.id]);
      await db.query("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','การจองถูกปฏิเสธ',$2)",
        [product.reserved_for_id, `ผู้ขายไม่ยืนยันการจอง "${product.title}"`]);
      const sock = onlineUsers?.get(product.reserved_for_id);
      if (sock) io?.to(sock).emit('notification', { type: 'system' });
      res.json({ message: 'ปฏิเสธการจองแล้ว' });
    } else {
      res.status(400).json({ error: 'action ต้องเป็น accept หรือ reject' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/my/reservations', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT p.id, p.title, p.price, p.image_url, p.status, p.reserved_for_id,
              u.name as reserved_by_name
       FROM products p LEFT JOIN users u ON u.id = p.reserved_for_id
       WHERE p.seller_id=$1 AND p.status='reserved' ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/products/bulk-csv — insert multiple products from parsed CSV data
router.post('/bulk-csv', authMiddleware, async (req, res) => {
  try {
    const { products } = req.body; // array of {title,price,category,condition,description,location}
    if (!Array.isArray(products) || !products.length) return res.status(400).json({ error: 'ไม่มีข้อมูลสินค้า' });
    if (products.length > 50) return res.status(400).json({ error: 'อัปโหลดได้สูงสุด 50 รายการ' });
    const db = getDB();
    let inserted = 0;
    for (const p of products) {
      if (!p.title || !p.price) continue;
      await db.query(
        'INSERT INTO products (title,price,category,condition,description,location,seller_id,delivery_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [p.title, Number(p.price)||0, p.category||'ทั่วไป', p.condition||'สภาพดี', p.description||'', p.location||'', req.user.id, p.delivery_method||'both']
      );
      inserted++;
    }
    res.json({ message: `เพิ่มสินค้าแล้ว ${inserted} รายการ`, inserted });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
