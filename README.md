# มือสองmarket 🛍️

เว็บขายของมือสองครบฟีเจอร์ — Frontend + Backend พร้อม deploy

## 🌐 Demo
- **Frontend (GitHub Pages):** `https://kulchartt.github.io/khai-claude`
- **Backend:** Deploy บน Railway / Render (ดูขั้นตอนด้านล่าง)

---

## 📁 โครงสร้างโปรเจค

```
khai-claude/
├── frontend/           ← GitHub Pages (static site)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── config.js   ← ตั้ง URL ของ backend ตรงนี้
│       ├── api.js
│       └── app.js
├── backend/            ← Node.js + Express API
│   ├── server.js
│   ├── db.js           ← SQLite database
│   ├── middleware/
│   ├── routes/
│   └── package.json
└── .github/workflows/  ← Auto deploy to GitHub Pages
```

---

## ✨ ฟีเจอร์

- ✅ สมัครสมาชิก / เข้าสู่ระบบ (JWT)
- ✅ ดูสินค้าทั้งหมด + ค้นหา + กรองหมวดหมู่
- ✅ กรองราคา + เรียงลำดับ
- ✅ หน้าดูรายละเอียดสินค้า
- ✅ ลงขายสินค้า + อัปโหลดรูปภาพ
- ✅ ตะกร้าสินค้า + ชำระเงิน
- ✅ รายการโปรด (Wishlist)
- ✅ โปรไฟล์ผู้ใช้ + สินค้าที่ลงขาย
- ✅ รองรับ Dark Mode อัตโนมัติ

---

## 🚀 วิธี Deploy

### ขั้นตอนที่ 1 — Push ขึ้น GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/kulchartt/khai-claude.git
git push -u origin main
```

### ขั้นตอนที่ 2 — เปิด GitHub Pages

1. ไปที่ `Settings` → `Pages`
2. Source เลือก **GitHub Actions**
3. GitHub จะ deploy frontend ให้อัตโนมัติทุกครั้งที่ push

### ขั้นตอนที่ 3 — Deploy Backend บน Railway (ฟรี)

1. ไปที่ [railway.app](https://railway.app) แล้ว Sign in ด้วย GitHub
2. กด **New Project** → **Deploy from GitHub repo** → เลือก `khai-claude`
3. เลือก **Root Directory** เป็น `backend`
4. ตั้ง Environment Variables:
   ```
   JWT_SECRET=your_random_secret_here
   FRONTEND_URL=https://kulchartt.github.io
   PORT=3000
   ```
5. Railway จะให้ URL เช่น `https://khai-claude-backend.up.railway.app`

### ขั้นตอนที่ 4 — เชื่อม Frontend กับ Backend

แก้ไขไฟล์ `frontend/js/config.js`:

```javascript
const CONFIG = {
  API_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://khai-claude-backend.up.railway.app'  // ← ใส่ URL จาก Railway
};
```

แล้ว push อีกครั้ง — GitHub Actions จะ deploy ให้อัตโนมัติ

---

## 💻 รันในเครื่องเอง (Local Development)

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run dev
# Server จะรันที่ http://localhost:3000

# Frontend
# เปิด frontend/index.html ใน browser ได้เลย
# หรือใช้ Live Server extension ใน VS Code
```

---

## 🔧 API Endpoints

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| POST | `/api/auth/register` | สมัครสมาชิก |
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| GET | `/api/auth/me` | ข้อมูลตัวเอง |
| GET | `/api/products` | ดูสินค้าทั้งหมด |
| GET | `/api/products/:id` | ดูสินค้าชิ้นเดียว |
| POST | `/api/products` | ลงขายสินค้า |
| PUT | `/api/products/:id` | แก้ไขสินค้า |
| DELETE | `/api/products/:id` | ลบสินค้า |
| GET | `/api/cart` | ดูตะกร้า |
| POST | `/api/cart/add` | เพิ่มลงตะกร้า |
| POST | `/api/cart/checkout` | ชำระเงิน |
| GET | `/api/wishlist` | ดูรายการโปรด |
| POST | `/api/wishlist/toggle` | เพิ่ม/ลบรายการโปรด |

---

## 🛠️ Tech Stack

**Frontend:** HTML5, CSS3, Vanilla JavaScript  
**Backend:** Node.js, Express.js, SQLite (better-sqlite3)  
**Auth:** JWT (jsonwebtoken) + bcryptjs  
**Deploy:** GitHub Pages (frontend) + Railway (backend)
