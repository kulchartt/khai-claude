const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data.db');
let db;

function getDB() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

function initDB() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      rating REAL DEFAULT 5.0,
      review_count INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      description TEXT DEFAULT '',
      location TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      seller_id INTEGER NOT NULL,
      status TEXT DEFAULT 'available',
      view_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      qty INTEGER DEFAULT 1,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      product_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(buyer_id, seller_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, reviewer_id)
    );
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      link TEXT DEFAULT '',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const count = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (count.c === 0) {
    const hash = bcrypt.hashSync('demo1234', 10);
    db.prepare("INSERT OR IGNORE INTO users (name, email, password, is_admin) VALUES ('Admin', 'admin@example.com', ?, 1)").run(hash);
    db.prepare("INSERT OR IGNORE INTO users (name, email, password) VALUES ('Demo Seller', 'demo@example.com', ?)").run(hash);
    const ins = db.prepare("INSERT INTO products (title, price, category, condition, description, location, seller_id) VALUES (?, ?, ?, ?, ?, ?, 2)");
    [
      ['iPhone 13 Pro 128GB', 18500, 'มือถือ', 'มือสองใหม่', 'สภาพ 95% ครบกล่อง ประกันเหลือ 3 เดือน', 'กรุงเทพฯ'],
      ['MacBook Air M1 8GB/256GB', 28000, 'มือถือ', 'มือสองใหม่', 'สภาพ 98% ครบกล่อง', 'กรุงเทพฯ'],
      ['Sony A6000 + เลนส์ 18-55mm', 8900, 'กล้อง', 'สภาพดี', 'ใช้ถ่ายรูปไม่มาก พร้อมกระเป๋า', 'กรุงเทพฯ'],
      ['รองเท้า Nike Air Max 270', 1200, 'กีฬา', 'สภาพดี', 'ใส่ไป 3 ครั้ง ไซส์ 42', 'เชียงใหม่'],
      ['Harry Potter ครบชุด 7 เล่ม', 650, 'หนังสือ', 'สภาพพอใช้', 'ครบชุด 7 เล่ม', 'ขอนแก่น'],
      ['Samsung Galaxy Tab S7', 11500, 'มือถือ', 'สภาพดี', 'Wi-Fi + Cellular แถมเคส', 'กรุงเทพฯ'],
      ['เสื้อยืด Vintage สไตล์ญี่ปุ่น', 350, 'เสื้อผ้า', 'สภาพดี', 'ไซส์ M-L ซักสะอาดแล้ว', 'กรุงเทพฯ'],
      ['โคมไฟตั้งโต๊ะปรับแสง', 490, 'ของแต่งบ้าน', 'สภาพดี', 'ปรับแสง 3 ระดับ USB', 'นนทบุรี'],
    ].forEach(p => ins.run(...p));
  }
  console.log('DB initialized');
}

module.exports = { getDB, initDB };
