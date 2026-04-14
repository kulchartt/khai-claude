const Database = require('better-sqlite3');
const path = require('path');

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
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  const count = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (count.c === 0) {
    const insertUser = db.prepare(`INSERT OR IGNORE INTO users (name, email, password) VALUES (?, ?, ?)`);
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('demo1234', 10);
    insertUser.run('Demo Seller', 'demo@example.com', hash);

    const insertProduct = db.prepare(`
      INSERT INTO products (title, price, category, condition, description, location, seller_id)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const seedProducts = [
      ['iPhone 13 Pro 128GB', 18500, 'มือถือ', 'มือสองใหม่', 'สภาพ 95% ครบกล่อง ประกันเหลือ 3 เดือน', 'กรุงเทพฯ'],
      ['MacBook Air M1 8GB/256GB', 28000, 'มือถือ', 'มือสองใหม่', 'ซื้อมาแล้ว 4 เดือน สภาพ 98% ครบกล่อง', 'กรุงเทพฯ'],
      ['Sony A6000 + เลนส์ 18-55mm', 8900, 'กล้อง', 'สภาพดี', 'ใช้ถ่ายรูปไม่มาก ชัตเตอร์ต่ำ พร้อมกระเป๋า', 'กรุงเทพฯ'],
      ['รองเท้า Nike Air Max 270', 1200, 'กีฬา', 'สภาพดี', 'ใส่ไป 3 ครั้ง สภาพเกือบใหม่ ไซส์ 42', 'เชียงใหม่'],
      ['Harry Potter ครบชุด 7 เล่ม', 650, 'หนังสือ', 'สภาพพอใช้', 'ครบชุด 7 เล่ม ปกอาจมีรอยบ้าง เนื้อในปกติ', 'ขอนแก่น'],
      ['Samsung Galaxy Tab S7 128GB', 11500, 'มือถือ', 'สภาพดี', 'Wi-Fi + Cellular แถมเคส + ฟิล์มกระจก', 'กรุงเทพฯ'],
      ['เสื้อยืด Vintage สไตล์ญี่ปุ่น', 350, 'เสื้อผ้า', 'สภาพดี', 'ไซส์ M-L สภาพดี ซักสะอาดแล้ว', 'กรุงเทพฯ'],
      ['โคมไฟตั้งโต๊ะปรับแสงได้', 490, 'ของแต่งบ้าน', 'สภาพดี', 'ปรับแสงได้ 3 ระดับ USB ชาร์จ', 'นนทบุรี'],
      ['จักรยาน BMX มือสอง', 2200, 'กีฬา', 'สภาพพอใช้', 'ล้อ 20 นิ้ว สีดำ ยางใหม่ เบรกปกติ', 'ปทุมธานี'],
      ['กระเป๋าเป้ Fjällräven', 1800, 'เสื้อผ้า', 'มือสองใหม่', 'ของแท้ สี Navy ใช้ไม่ถึง 5 ครั้ง', 'กรุงเทพฯ'],
    ];
    for (const p of seedProducts) insertProduct.run(...p);
  }

  console.log('Database initialized');
}

module.exports = { getDB, initDB };
