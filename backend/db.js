require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

function getDB() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

async function initDB() {
  const db = getDB();

  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, avatar TEXT DEFAULT '', rating REAL DEFAULT 5.0,
    review_count INTEGER DEFAULT 0, is_admin INTEGER DEFAULT 0,
    is_banned INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, price REAL NOT NULL,
    category TEXT NOT NULL, condition TEXT NOT NULL, description TEXT DEFAULT '',
    location TEXT DEFAULT '', image_url TEXT DEFAULT '',
    seller_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'available', view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty INTEGER DEFAULT 1, added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, product_id)
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS wishlist_items (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, product_id)
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, total REAL NOT NULL,
    status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW()
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    price REAL NOT NULL, qty INTEGER NOT NULL
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS chat_rooms (
    id SERIAL PRIMARY KEY, buyer_id INTEGER NOT NULL, seller_id INTEGER NOT NULL,
    product_id INTEGER, created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(buyer_id, seller_id, product_id)
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES chat_rooms(id),
    sender_id INTEGER NOT NULL, content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL, reviewer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(product_id, reviewer_id)
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
    url TEXT NOT NULL, sort_order INTEGER DEFAULT 0
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, type TEXT NOT NULL,
    title TEXT NOT NULL, body TEXT DEFAULT '', link TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);

  // เพิ่ม columns ใหม่
  await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS bumped_at TIMESTAMP DEFAULT NULL`);
  await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price REAL DEFAULT NULL`);
  await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'both'`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending'`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS slip_url TEXT DEFAULT NULL`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS promptpay TEXT DEFAULT NULL`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT DEFAULT NULL`);

  // Fix: สินค้าที่อยู่ใน order ที่ยังไม่จบ (awaiting_payment / awaiting_confirmation)
  // ถูก set เป็น sold ผิดพลาดโดยโค้ดเก่า — เปลี่ยนกลับเป็น reserved
  await db.query(`
    UPDATE products SET status = 'reserved'
    WHERE status = 'sold'
    AND id IN (
      SELECT oi.product_id FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN ('awaiting_payment', 'awaiting_confirmation')
    )
  `);

  await db.query(`CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    buyer_id INTEGER NOT NULL REFERENCES users(id),
    seller_id INTEGER NOT NULL REFERENCES users(id),
    offer_price REAL NOT NULL,
    message TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS follows (
    id SERIAL PRIMARY KEY,
    follower_id INTEGER NOT NULL REFERENCES users(id),
    seller_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(follower_id, seller_id)
  )`);

  // Users new columns
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_name TEXT DEFAULT NULL`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_bio TEXT DEFAULT NULL`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_banner TEXT DEFAULT NULL`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_rating REAL DEFAULT 5.0`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_review_count INTEGER DEFAULT 0`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified INTEGER DEFAULT 0`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT NULL`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account TEXT DEFAULT NULL`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_name TEXT DEFAULT NULL`);

  // Address book
  await db.query(`CREATE TABLE IF NOT EXISTS addresses (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'บ้าน', recipient_name TEXT NOT NULL,
    phone TEXT NOT NULL, address TEXT NOT NULL, province TEXT NOT NULL,
    is_default INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);

  // Buyer reviews (seller reviews buyer after completed order)
  await db.query(`CREATE TABLE IF NOT EXISTS buyer_reviews (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
    reviewer_id INTEGER NOT NULL REFERENCES users(id),
    buyer_id INTEGER NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(order_id, reviewer_id)
  )`);

  // Saved searches
  await db.query(`CREATE TABLE IF NOT EXISTS saved_searches (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword TEXT DEFAULT '', category TEXT DEFAULT 'ทั้งหมด',
    max_price REAL DEFAULT NULL, created_at TIMESTAMP DEFAULT NOW()
  )`);

  // Disputes
  await db.query(`CREATE TABLE IF NOT EXISTS disputes (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL, detail TEXT DEFAULT '',
    evidence_url TEXT DEFAULT NULL,
    status TEXT DEFAULT 'open',
    admin_note TEXT DEFAULT NULL, created_at TIMESTAMP DEFAULT NOW()
  )`);

  // Promo codes
  await db.query(`CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY, code TEXT NOT NULL,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discount_type TEXT NOT NULL DEFAULT 'percent',
    discount_value REAL NOT NULL,
    min_order REAL DEFAULT 0,
    uses_limit INTEGER DEFAULT NULL,
    uses_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP DEFAULT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(seller_id, code)
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL, reporter_id INTEGER NOT NULL,
    reason TEXT NOT NULL, detail TEXT DEFAULT '', status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(), UNIQUE(product_id, reporter_id)
  )`);

  const { rows } = await db.query('SELECT COUNT(*) as c FROM products');
  if (parseInt(rows[0].c) === 0) {
    const hash = await bcrypt.hash('demo1234', 10);
    await db.query("INSERT INTO users (name, email, password, is_admin) VALUES ($1,$2,$3,1) ON CONFLICT (email) DO NOTHING", ['Admin','admin@example.com',hash]);
    await db.query("INSERT INTO users (name, email, password) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING", ['Demo Seller','demo@example.com',hash]);
    const { rows: sr } = await db.query("SELECT id FROM users WHERE email='demo@example.com'");
    const sid = sr[0].id;
    const products = [
      ['iPhone 13 Pro 128GB',18500,'มือถือ','มือสองใหม่','สภาพ 95% ครบกล่อง ประกันเหลือ 3 เดือน','กรุงเทพฯ'],
      ['MacBook Air M1 8GB/256GB',28000,'มือถือ','มือสองใหม่','สภาพ 98% ครบกล่อง','กรุงเทพฯ'],
      ['Sony A6000 + เลนส์ 18-55mm',8900,'กล้อง','สภาพดี','ใช้ถ่ายรูปไม่มาก พร้อมกระเป๋า','กรุงเทพฯ'],
      ['รองเท้า Nike Air Max 270',1200,'กีฬา','สภาพดี','ใส่ไป 3 ครั้ง ไซส์ 42','เชียงใหม่'],
      ['Harry Potter ครบชุด 7 เล่ม',650,'หนังสือ','สภาพพอใช้','ครบชุด 7 เล่ม','ขอนแก่น'],
      ['Samsung Galaxy Tab S7',11500,'มือถือ','สภาพดี','Wi-Fi + Cellular แถมเคส','กรุงเทพฯ'],
      ['เสื้อยืด Vintage สไตล์ญี่ปุ่น',350,'เสื้อผ้า','สภาพดี','ไซส์ M-L ซักสะอาดแล้ว','กรุงเทพฯ'],
      ['โคมไฟตั้งโต๊ะปรับแสง',490,'ของแต่งบ้าน','สภาพดี','ปรับแสง 3 ระดับ USB','นนทบุรี'],
    ];
    for (const p of products) {
      await db.query('INSERT INTO products (title,price,category,condition,description,location,seller_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [...p, sid]);
    }
  }
  console.log('DB initialized');
}

module.exports = { getDB, initDB };
