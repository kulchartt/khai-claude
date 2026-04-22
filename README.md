# 🛍️ PloiKhong — ตลาดซื้อขายของมือสอง

ระบบ marketplace ของมือสองครบวงจร พัฒนาด้วย Next.js 14 + Node.js + PostgreSQL

---

## 🌐 Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://frondend-ploikhong-next.vercel.app |
| Backend API | https://khai-claude-production.up.railway.app |
| Admin Panel | https://frondend-ploikhong-next.vercel.app/admin |

---

## 📁 โครงสร้างโปรเจค

```
khai-claude/          ← Backend repo (Node.js)
├── backend/
│   ├── server.js         ← Express entry point + Socket.io + cron jobs
│   ├── db.js             ← PostgreSQL schema + migrations + seed
│   ├── middleware/
│   │   └── auth.js       ← JWT middleware
│   ├── routes/
│   │   ├── auth.js       ← Register / Login / Me / Preferences
│   │   ├── products.js   ← CRUD + categories + upload
│   │   ├── chat.js       ← Chat rooms + messages + image upload
│   │   ├── coins.js      ← Premium coins + payment + admin stats
│   │   ├── analytics.js  ← Events + seller analytics + recommendations
│   │   ├── follows.js    ← Follow/unfollow sellers
│   │   ├── notifications.js
│   │   ├── offers.js
│   │   └── wishlist.js
│   └── cloudinary.js     ← Image upload helper

frondend-ploikhong-next/   ← Frontend repo (Next.js 14)
├── src/
│   ├── app/
│   │   ├── page.tsx          ← หน้าแรก (marketplace)
│   │   ├── admin/page.tsx    ← Admin panel
│   │   ├── terms/page.tsx    ← เงื่อนไขการใช้งาน
│   │   ├── rules/page.tsx    ← กฎและข้อบังคับ
│   │   ├── refund/page.tsx   ← นโยบายการคืนสินค้า
│   │   ├── privacy/page.tsx  ← นโยบายความเป็นส่วนตัว
│   │   ├── layout.tsx
│   │   └── providers.tsx     ← SessionProvider + BgColorApplier
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── Sidebar.tsx       ← Category filter (real counts from DB)
│   │   ├── MyHub.tsx         ← User hub (buy/sell/premium/settings)
│   │   ├── ProductCard.tsx   ← Grid + List layout
│   │   ├── ProductDetail.tsx
│   │   ├── ListingFlow.tsx   ← Create/edit listing wizard
│   │   ├── ChatDrawer.tsx
│   │   ├── AuthModal.tsx
│   │   └── ...
│   └── lib/
│       └── api.ts            ← All API call functions
```

---

## ✨ ฟีเจอร์ทั้งหมด

### 🛒 Core Marketplace
- ดูสินค้า / ค้นหา / กรองหมวดหมู่ (จำนวนจริงจาก DB)
- กรองราคา / สภาพ / พื้นที่ / วิธีส่ง
- Grid view / List view
- รายละเอียดสินค้า + รูปภาพ Cloudinary
- ลงขายสินค้า + อัปโหลดรูปหลายรูป

### 👤 Auth & User
- สมัคร/Login ด้วย Email หรือ Social (Google/Facebook)
- JWT authentication
- User preferences: bg_color, dark_mode, remember_prefs

### 💬 Chat & Offers
- Real-time chat ด้วย Socket.io
- แนบรูปในแชท
- เสนอราคา (offers) พร้อม accept/reject

### ❤️ Social Features
- Wishlist
- ติดตามร้านค้า (Follow/Unfollow)
- แจ้งเตือน (Notifications)
- ร้านค้า (Shop page per seller)

### ⭐ Premium & Coins
| Feature | เหรียญ | ระยะเวลา |
|---------|--------|----------|
| สินค้าเด่น (Featured) | 80 | 7 วัน |
| ดันสินค้าขึ้นบนสุด | 30 | 7 วัน |
| แจ้งเตือนผู้ติดตาม | 25 | 30 วัน |
| ลงประกาศอัตโนมัติ | 20 | 30 วัน |
| Analytics Pro | 50 | 30 วัน |

- ซื้อเหรียญด้วย PromptPay
- Admin ยืนยัน/ปฏิเสธ payment
- Auto-relist cron job ทุกวัน

### 🎨 Appearance Preferences
- เลือกสีพื้นหลัง 12 สี
- Dark / Light mode
- Checkbox จำ preference ข้าม device (sync ผ่าน DB)

### 📊 Analytics
- Event tracking (view / wishlist / chat_open / offer / share)
- Seller analytics dashboard
- AI Recommendations (Analytics Pro)

### 🛡️ Admin Panel (`/admin`)
- ภาพรวม: KPI stats (users, products, revenue)
- จัดการผู้ใช้: ban/unban, toggle admin
- จัดการสินค้า: search + delete
- Premium: revenue sources breakdown ต่อ feature + estimated baht
- ค่าอนุมัติเหรียญ: confirm/reject payment requests

### 📄 Legal Pages
- `/terms` — เงื่อนไขการใช้งาน
- `/rules` — กฎและข้อบังคับ (สินค้าต้องห้าม/ควบคุม)
- `/refund` — นโยบายการคืนสินค้า
- `/privacy` — นโยบายความเป็นส่วนตัว

---

## 🔧 API Endpoints

### Auth
| Method | Path | คำอธิบาย |
|--------|------|-----------|
| POST | `/api/auth/register` | สมัครสมาชิก |
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| POST | `/api/auth/social` | Social login |
| GET | `/api/auth/me` | ข้อมูล + preferences |
| PATCH | `/api/auth/preferences` | บันทึก bg_color / dark_mode / remember_prefs |

### Products
| Method | Path | คำอธิบาย |
|--------|------|-----------|
| GET | `/api/products` | รายการสินค้า (พร้อม filter) |
| GET | `/api/products/categories` | จำนวนสินค้าต่อหมวด (real counts) |
| GET | `/api/products/:id` | รายละเอียดสินค้า |
| POST | `/api/products` | ลงขายสินค้า |
| PATCH | `/api/products/:id` | แก้ไขสินค้า |
| DELETE | `/api/products/:id` | ลบสินค้า |
| GET | `/api/products/my` | สินค้าของตัวเอง |

### Coins / Premium
| Method | Path | คำอธิบาย |
|--------|------|-----------|
| GET | `/api/coins/packages` | แพ็กเกจเหรียญ + PromptPay |
| GET | `/api/coins/balance` | ยอดเหรียญ |
| POST | `/api/coins/request-payment` | ขอซื้อเหรียญ |
| POST | `/api/coins/activate-feature` | เปิดใช้ฟีเจอร์ premium |
| GET | `/api/coins/admin/stats` | สถิติ premium สำหรับ admin |
| POST | `/api/coins/payment-requests/:id/confirm` | อนุมัติ payment (admin) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, TypeScript, inline styles |
| Auth | NextAuth.js v5 (JWT) |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (Railway) |
| Real-time | Socket.io |
| Images | Cloudinary |
| Deploy FE | Vercel (auto deploy จาก GitHub push) |
| Deploy BE | Railway (auto deploy จาก GitHub push) |

---

## 👤 Admin Account

```
Email:    admin@ploikhong.com
Password: admin1234
```

---

## 💻 Local Development

```bash
# Backend
cd backend
cp .env.example .env   # ตั้ง DATABASE_URL, JWT_SECRET, CLOUDINARY_*
npm install
npm run dev            # http://localhost:3001

# Frontend
cd ../frondend-ploikhong-next
cp .env.local.example .env.local  # ตั้ง NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev            # http://localhost:3000
```

---

## 🔑 Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
PROMPTPAY_NUMBER=...
FRONTEND_URL=https://frondend-ploikhong-next.vercel.app
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=https://khai-claude-production.up.railway.app
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://frondend-ploikhong-next.vercel.app
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```
