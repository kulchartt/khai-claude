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

  // เพิ่ม bumped_at column ถ้ายังไม่มี
  await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS bumped_at TIMESTAMP DEFAULT NULL`);

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
