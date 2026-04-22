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

// ─── Single image upload ─────────────────────────────────────────────────────
router.post('/upload', authMiddleware, (req, res, next) => {
  upload.single('image')(req, res, err => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ' });
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'ploikhong/products',
      transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
    });
    res.json({ url: result.secure_url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/products/categories — real counts per category
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await getDB().query(`
      SELECT category, COUNT(*) as count
      FROM products
      WHERE status IN ('available','reserved') AND is_draft = 0
        AND (publish_at IS NULL OR publish_at <= NOW())
      GROUP BY category
      ORDER BY count DESC
    `);
    const total = rows.reduce((s, r) => s + parseInt(r.count), 0);
    res.json({ total, categories: rows.map(r => ({ name: r.category, count: parseInt(r.count) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const { cat, q, minPrice, maxPrice, sort, condition, location, seller_id, page = 1, limit = 20 } = req.query;
    let sql = `SELECT p.*, COALESCE(u.shop_name, u.name) as seller_name, u.rating as seller_rating,
  EXISTS(
    SELECT 1 FROM feature_activations fa
    WHERE fa.product_id = p.id AND fa.feature_key = 'featured' AND fa.expires_at > NOW()
  ) as is_featured
  FROM products p JOIN users u ON p.seller_id = u.id
  WHERE p.status IN ('available','reserved') AND p.is_draft = 0 AND (p.publish_at IS NULL OR p.publish_at <= NOW())`;
    const params = [];
    let n = 0;
    const p = () => `$${++n}`;
    if (seller_id) { sql += ` AND p.seller_id = ${p()}`; params.push(Number(seller_id)); }
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
      SELECT p.*, COALESCE(u.shop_name, u.name) as seller_name, u.rating as seller_rating,
        COUNT(DISTINCT w.id)::int as wishlist_count,
        (COALESCE(p.view_count,0) + COUNT(DISTINCT w.id) * 3) as score
      FROM products p
      JOIN users u ON p.seller_id = u.id
      LEFT JOIN wishlist_items w ON w.product_id = p.id
      WHERE p.status = 'available'
      GROUP BY p.id, u.name, u.shop_name, u.rating
      ORDER BY score DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// My listings
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT p.*, COALESCE(u.shop_name, u.name) as seller_name
       FROM products p JOIN users u ON p.seller_id = u.id
       WHERE p.seller_id = $1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Seller view: products that others reserved from me
router.get('/my/reservations', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT p.id, p.title, p.price, p.image_url, p.status, p.reserved_for_id, p.reserved_at,
              u.name as reserved_by_name
       FROM products p LEFT JOIN users u ON u.id = p.reserved_for_id
       WHERE p.seller_id=$1 AND p.status='reserved' ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Buyer view: products I reserved
router.get('/my/reserved-by-me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      `SELECT p.id, p.title, p.price, p.image_url, p.status, p.reserved_at, p.delivery_method,
              COALESCE(u.shop_name, u.name) as seller_name, u.id as seller_id
       FROM products p JOIN users u ON u.id = p.seller_id
       WHERE p.reserved_for_id=$1 AND p.status='reserved' ORDER BY p.reserved_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDB();
    const { rows: pr } = await db.query(`
      SELECT p.*, COALESCE(u.shop_name, u.name) as seller_name, u.name as seller_real_name, u.email as seller_email,
             u.rating as seller_rating, u.review_count as seller_reviews, u.avatar as seller_avatar,
             u.holiday_mode as seller_holiday_mode,
             EXISTS(
               SELECT 1 FROM feature_activations fa
               WHERE fa.product_id = p.id AND fa.feature_key = 'featured' AND fa.expires_at > NOW()
             ) as is_featured
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
    const { title, price, category, condition, description, location, delivery_method, delivery, is_draft, publish_at, meetup_lat, meetup_lng, meetup_note } = req.body;
    if (!title || !price || !category) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    const db = getDB();

    // Upload all images to Cloudinary (multipart upload)
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
    } else {
      // Pre-uploaded images: frontend uploads first then POSTs URLs as JSON
      const jsonImages = req.body.images;
      if (Array.isArray(jsonImages) && jsonImages.length > 0) {
        uploadedUrls.push(...jsonImages);
        firstImageUrl = jsonImages[0];
      } else if (req.body.image_url) {
        firstImageUrl = req.body.image_url;
        uploadedUrls.push(firstImageUrl);
      }
    }

    // Support both delivery_method (old) and delivery (new ListingFlow field name)
    const deliveryMethod = delivery_method || delivery || 'both';

    const { rows } = await db.query(
      'INSERT INTO products (title,price,category,condition,description,location,image_url,seller_id,delivery_method,is_draft,publish_at,meetup_lat,meetup_lng,meetup_note,watermark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id',
      [title, Number(price), category, condition || 'สภาพดี', description || '', location || '', firstImageUrl, req.user.id, deliveryMethod, is_draft ? 1 : 0, publish_at || null, meetup_lat || null, meetup_lng || null, meetup_note || null, req.body.watermark === '1' ? 1 : 0]
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

    req.app.get('io')?.emit('product:new', { id: productId });
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
      const uploadOptions = { folder: 'mueasong/products' };
      if (req.body.watermark === '1') {
        uploadOptions.transformation = [
          { overlay: { font_family: 'Arial', font_size: 13, font_weight: 'normal', text: 'PloiKhong' },
            gravity: 'south_east', x: 6, y: 6, opacity: 35, color: 'white' }
        ];
      }
      for (let i = 0; i < req.files.length; i++) {
        const result = await uploadToCloudinary(req.files[i].buffer, uploadOptions);
        const url = result.secure_url;
        if (i === 0 && !firstImage) firstImage = url; // อัปเดต cover เฉพาะตอนยังไม่มีรูปเดิม
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

    const newWatermark = req.body.watermark !== undefined ? (req.body.watermark === '1' ? 1 : 0) : product.watermark;
    await db.query(
      'UPDATE products SET title=$1,price=$2,category=$3,condition=$4,description=$5,location=$6,image_url=$7,status=$8,delivery_method=$9,original_price=$10,meetup_lat=$11,meetup_lng=$12,meetup_note=$13,watermark=$14 WHERE id=$15',
      [title||product.title, price?Number(price):product.price, category||product.category, condition||product.condition,
       description!==undefined?description:product.description, location!==undefined?location:product.location,
       firstImage, status||product.status, delivery_method||product.delivery_method||'both', newOriginalPrice,
       meetup_lat!==undefined?(meetup_lat||null):product.meetup_lat,
       meetup_lng!==undefined?(meetup_lng||null):product.meetup_lng,
       meetup_note!==undefined?meetup_note:product.meetup_note,
       newWatermark, req.params.id]
    );

    // Price drop alert: notify wishlist users
    if (price && Number(price) < product.price) {
      let wishers = [];
      try {
        const newP = Number(price), oldP = product.price;
        const { rows: wisherRows } = await db.query('SELECT user_id FROM wishlist_items WHERE product_id = $1', [req.params.id]);
        wishers = wisherRows;
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

      // Price Alert premium: also notify followers if seller has price_alert active
      try {
        const { rows: pa } = await db.query(
          `SELECT 1 FROM feature_activations WHERE user_id=$1 AND feature_key='price_alert' AND expires_at > NOW() LIMIT 1`,
          [req.user.id]
        );
        if (pa.length > 0) {
          const { rows: followers } = await db.query('SELECT follower_id FROM follows WHERE seller_id=$1', [req.user.id]);
          const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
          for (const { follower_id } of followers) {
            // skip if already notified as wishlist user
            const alreadyNotified = wishers.some((w) => w.user_id === follower_id);
            if (alreadyNotified || follower_id === req.user.id) continue;
            await db.query(
              "INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'system','💰 ราคาลดจากร้านที่คุณติดตาม',$2)",
              [follower_id, `${title||product.title} ลดจาก ฿${Number(product.price).toLocaleString()} เป็น ฿${Number(price).toLocaleString()}`]
            );
            const sock = onlineUsers?.get(follower_id);
            if (sock) io?.to(sock).emit('notification', { type: 'system' });
          }
        }
      } catch (paErr) { console.error('price_alert notify followers:', paErr); }
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
    req.app.get('io')?.emit('product:update', { id: parseInt(req.params.id), status: 'sold' });
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

    // เช็คว่า bump ไปแล้วในวันนี้หรือเปล่า (ใช้ UTC+7 สำหรับผู้ใช้ไทย)
    if (product.bumped_at) {
      const TZ_OFFSET = 7 * 60 * 60 * 1000; // UTC+7
      const lastBump = new Date(new Date(product.bumped_at).getTime() + TZ_OFFSET);
      const now = new Date(Date.now() + TZ_OFFSET);
      const sameDay = lastBump.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
      if (sameDay) {
        // คำนวณเวลาที่ bump ได้อีก (เที่ยงคืนวันถัดไป UTC+7)
        const tomorrowUTC7 = new Date(now);
        tomorrowUTC7.setUTCDate(tomorrowUTC7.getUTCDate() + 1);
        tomorrowUTC7.setUTCHours(0, 0, 0, 0);
        const diff = tomorrowUTC7 - now;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return res.status(400).json({ error: `ดันโพสต์ได้อีกครั้งใน ${h} ชม. ${m} นาที` });
      }
    }

    await db.query('UPDATE products SET bumped_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'ดันโพสต์ขึ้นบนสุดแล้ว! ⬆️' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/products/:id/images/reorder
router.patch('/:id/images/reorder', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body; // array of image IDs in new order
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be array' });
    const db = getDB();
    const { rows: pr } = await db.query('SELECT * FROM products WHERE id=$1', [req.params.id]);
    if (!pr[0] || pr[0].seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    for (let i = 0; i < ids.length; i++) {
      await db.query('UPDATE product_images SET sort_order=$1 WHERE id=$2 AND product_id=$3', [i, ids[i], req.params.id]);
    }
    // sync image_url → รูปแรกในลำดับใหม่
    const { rows: first } = await db.query(
      'SELECT url FROM product_images WHERE product_id=$1 ORDER BY sort_order ASC LIMIT 1', [req.params.id]
    );
    if (first[0]) await db.query('UPDATE products SET image_url=$1 WHERE id=$2', [first[0].url, req.params.id]);
    res.json({ message: 'อัปเดตลำดับรูปแล้ว' });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
      // extract full public_id: everything after /upload/v.../
      const match = img.url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
      const publicId = match ? match[1] : null;
      if (publicId) {
        const { cloudinary } = require('../cloudinary');
        await cloudinary.uploader.destroy(publicId).catch(() => {});
      }
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
    req.app.get('io')?.emit('product:deleted', { id: parseInt(req.params.id) });
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
    await db.query("UPDATE products SET status='reserved', reserved_for_id=$1, reserved_at=NOW() WHERE id=$2", [req.user.id, req.params.id]);
    const { rows: buyerRow } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
    const buyerName = buyerRow[0]?.name || 'ผู้ซื้อ';
    await db.query("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','มีคนจองสินค้า 🔖',$2)",
      [product.seller_id, `${buyerName} ขอจอง "${product.title}"`]);
    const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
    const sock = onlineUsers?.get(product.seller_id);
    if (sock) io?.to(sock).emit('notification', { type: 'system' });
    io?.emit('product:update', { id: parseInt(req.params.id), status: 'reserved' });
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
    if (product.status !== 'reserved') return res.status(400).json({ error: 'สินค้านี้ไม่ได้ถูกจอง' });
    const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
    // Buyer cancels their own reservation
    if (action === 'cancel') {
      if (product.reserved_for_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
      await db.query("UPDATE products SET status='available', reserved_for_id=NULL, reserved_at=NULL WHERE id=$1", [req.params.id]);
      await db.query("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','ผู้ซื้อยกเลิกการจอง',$2)",
        [product.seller_id, `ผู้ซื้อยกเลิกการจอง "${product.title}" แล้ว`]);
      const sock = onlineUsers?.get(product.seller_id);
      if (sock) io?.to(sock).emit('notification', { type: 'system' });
      io?.emit('product:update', { id: parseInt(req.params.id), status: 'available' });
      return res.json({ message: 'ยกเลิกการจองแล้ว' });
    }
    // Seller accept / reject
    if (product.seller_id !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    if (action === 'accept') {
      await db.query("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','การจองได้รับการยืนยัน ✅',$2)",
        [product.reserved_for_id, `ผู้ขายยืนยันการจอง "${product.title}" แล้ว! กด ⚡ ซื้อเลย เพื่อดำเนินการต่อ`]);
      const sock = onlineUsers?.get(product.reserved_for_id);
      if (sock) io?.to(sock).emit('notification', { type: 'system' });
      res.json({ message: 'ยืนยันการจองแล้ว ✅' });
    } else if (action === 'reject') {
      await db.query("UPDATE products SET status='available', reserved_for_id=NULL, reserved_at=NULL WHERE id=$1", [req.params.id]);
      await db.query("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'system','การจองถูกปฏิเสธ',$2)",
        [product.reserved_for_id, `ผู้ขายไม่ยืนยันการจอง "${product.title}"`]);
      const sock = onlineUsers?.get(product.reserved_for_id);
      if (sock) io?.to(sock).emit('notification', { type: 'system' });
      io?.emit('product:update', { id: parseInt(req.params.id), status: 'available' });
      res.json({ message: 'ปฏิเสธการจองแล้ว' });
    } else {
      res.status(400).json({ error: 'action ไม่ถูกต้อง' });
    }
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
