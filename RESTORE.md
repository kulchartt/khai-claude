# Restore Guide — khai-claude

คู่มือ restore โปรเจกต์นี้ตั้งแต่ศูนย์ หลังจาก disaster หรือย้าย server ใหม่

---

## 1. Clone โปรเจกต์จาก GitHub

```bash
git clone https://github.com/kulchartt/khai-claude.git
cd khai-claude
```

---

## 2. ตั้งค่า Backend (Node.js)

### ติดตั้ง dependencies

```bash
cd backend
npm install
```

### สร้างไฟล์ `.env`

```bash
cp .env.example .env
# แล้วเปิด .env แล้วใส่ค่าจริงทุกตัว (ดู Section 4)
```

---

## 3. สร้าง PostgreSQL Database

### ตัวเลือก A — Railway (แนะนำ ใช้อยู่แล้ว)

1. ไปที่ [railway.app](https://railway.app) → New Project
2. Add service → Database → PostgreSQL
3. คัดลอก `DATABASE_URL` จาก Variables tab
4. Schema จะ init อัตโนมัติตอน backend start ครั้งแรก (db.js รัน `initDB()`)

### ตัวเลือก B — Render

1. [render.com](https://render.com) → New → PostgreSQL
2. คัดลอก External Database URL
3. ใส่ใน `.env` เป็น `DATABASE_URL`

### ตัวเลือก C — Fly.io

```bash
fly postgres create
fly postgres attach --app <your-app-name>
```

---

## 4. ตั้งค่า Environment Variables

ดูค่าที่ต้องใส่ทั้งหมดใน `backend/.env.example`

| Variable | ได้จากที่ไหน |
|---|---|
| `PORT` | Railway ตั้งให้อัตโนมัติ (ไม่ต้องใส่ใน Railway) |
| `DATABASE_URL` | Railway/Render → Database → Variables |
| `JWT_SECRET` | สร้างใหม่: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FRONTEND_URL` | `https://kulchartt.github.io` |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `CLOUDINARY_CLOUD_NAME` | [cloudinary.com/console](https://cloudinary.com/console) |
| `CLOUDINARY_API_KEY` | Cloudinary Dashboard |
| `CLOUDINARY_API_SECRET` | Cloudinary Dashboard |

**สำหรับ Railway:** ใส่ env vars ใน Railway Dashboard → Service → Variables (ไม่ต้องมีไฟล์ .env บน server)

---

## 5. Deploy Backend

### Railway (แนะนำ)

1. Railway Dashboard → New Project → Deploy from GitHub repo
2. เลือก repo `kulchartt/khai-claude`
3. Set Root Directory → `backend`
4. ใส่ env vars ทั้งหมดใน Variables tab
5. Railway จะ deploy อัตโนมัติทุกครั้งที่ push to `main`

### Manual (local test)

```bash
cd backend
node server.js
```

---

## 6. Deploy Frontend (GitHub Pages)

Frontend เป็น static HTML/JS ใช้ GitHub Pages อยู่แล้ว:

1. ไปที่ GitHub repo → Settings → Pages
2. Source: Deploy from branch → `main` → `/frontend`
3. รอสักครู่ แล้ว site จะอยู่ที่ `https://kulchartt.github.io/khai-claude`

**ถ้า backend URL เปลี่ยน** ให้แก้ไฟล์ `frontend/js/config.js`:

```js
const API_BASE = 'https://your-new-backend.railway.app';
```

---

## 7. Restore ข้อมูลจาก Backup

### วิธี A — จาก GitHub Actions artifact (.sql.gz)

1. ไปที่ GitHub → Actions → DB Backup → เลือก run ล่าสุด
2. Download artifact `db-backup-YYYYMMDD`
3. แตกไฟล์และ restore:

```bash
# แตกไฟล์ .gz
gunzip backup_YYYYMMDD_HHMMSS.sql.gz

# Restore เข้า database ใหม่
psql "$DATABASE_URL" < backup_YYYYMMDD_HHMMSS.sql
```

### วิธี B — จาก Admin Backup Endpoint (JSON)

1. Login ด้วย Admin account ที่ frontend
2. เรียก API (หรือใช้ curl):

```bash
curl -H "Authorization: Bearer <admin_jwt_token>" \
     "https://your-backend.railway.app/api/admin/backup" \
     -o backup_$(date +%Y%m%d).json
```

3. JSON ไฟล์มี tables: users, products, orders, order_items, reviews, webauthn_credentials, offers, addresses

4. Import กลับด้วย script หรือ เขียน migration script ตาม schema

**หมายเหตุ:** วิธี B ได้ข้อมูลเป็น JSON ไม่ใช่ SQL — เหมาะสำหรับดูข้อมูลหรือ migrate แบบ manual มากกว่า restore ทั้งระบบ

---

## 8. Cloudinary Images

ไม่ต้อง migrate ภาพ เพราะ:

- ภาพทั้งหมดเก็บอยู่บน **Cloudinary** (ไม่ได้อยู่ใน server)
- Database เก็บแค่ URL ของรูป เช่น `https://res.cloudinary.com/xxx/image/upload/...`
- ถ้า restore DB ครบ ภาพจะกลับมาเองอัตโนมัติ

สิ่งที่ต้องทำคือใส่ `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` ให้ถูกต้อง เพื่อให้ upload ภาพใหม่ได้

---

## Quick Checklist

- [ ] Clone repo
- [ ] สร้าง PostgreSQL DB ใหม่
- [ ] คัดลอก `DATABASE_URL`
- [ ] ตั้งค่า env vars ทั้งหมดบน Railway
- [ ] Deploy backend
- [ ] ตรวจสอบ `GET /api/health` ตอบ `{"status":"ok"}`
- [ ] Restore DB จาก backup (ถ้ามี)
- [ ] ตรวจสอบ GitHub Pages ยังทำงานปกติ
- [ ] ทดสอบ login / upload สินค้า / checkout

---

*คู่มือนี้เขียนสำหรับโปรเจกต์ khai-claude | GitHub: kulchartt/khai-claude*
