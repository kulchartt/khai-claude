# PloiKhong — Feature List

> ตลาดออนไลน์ ของมือหนึ่งก็มี มือสองก็ดี — with AI  
> อัปเดตล่าสุด: **2026-04-16** — Round 6A complete (Voice Message, Image Search, eKYC)

---

## 🔐 Authentication & Account

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Register / Login | สมัครสมาชิกด้วย email + password | ✅ Done |
| JWT Auth | token เก็บใน localStorage | ✅ Done |
| Referral Code | รหัสชวนเพื่อน สร้างอัตโนมัติตอนสมัคร | ✅ Done |
| Referral Reward | ผู้ชวน +100 pt / คนใหม่ +50 pt | ✅ Done |
| Avatar Upload | อัปโหลดรูปโปรไฟล์ผ่าน Cloudinary | ✅ Done |
| Biometric Login | Face/Fingerprint (Web Auth API) | 🔲 Round 6 |

---

## 🛍️ Product Listing

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| ลงขายสินค้า | title, price, category, condition, description, location, รูปภาพ | ✅ Done |
| สภาพสินค้า 4 ระดับ | มือหนึ่ง(ใหม่) / เหมือนใหม่ / สภาพดี / สภาพพอใช้ | ✅ Done |
| หมวดหมู่สินค้า | มือถือ, เสื้อผ้า, หนังสือ, กีฬา, ของแต่งบ้าน, กล้อง | ✅ Done |
| Delivery Method | นัดรับ / ส่งพัสดุ / ทั้งคู่ | ✅ Done |
| Draft & Schedule | บันทึก draft + ตั้งเวลาเผยแพร่ | ✅ Done |
| Publish Draft | กดเผยแพร่ draft ได้จากหน้า My Products | ✅ Done |
| แก้ไขสินค้า | edit title, price, category, condition, status | ✅ Done |
| ลบสินค้า | ลบสินค้าตัวเอง | ✅ Done |
| Bump สินค้า | ดันสินค้าขึ้นด้านบนได้วันละครั้ง | ✅ Done |
| Flash Sale | ตั้งราคา flash + ระยะเวลา มี countdown timer | ✅ Done |
| Price Drop Alert | แจ้งเตือนคนที่ wishlist เมื่อราคาลดลง | ✅ Done |
| จองสินค้า (Reserve) | ผู้ซื้อขอจอง, ผู้ขาย approve/reject | ✅ Done |
| Close Sale | ผู้ขายปิดการขายก่อนกำหนด | ✅ Done |
| Watermark รูปภาพ | ใส่ลายน้ำอัตโนมัติบนรูปสินค้า | ✅ Done |
| Bulk CSV Upload | อัปโหลดสินค้าหลายรายการผ่าน CSV | ✅ Done |
| Image Search | ค้นหาสินค้าด้วยรูปภาพ | ✅ Done |
| AI เขียน Description | AI ช่วยเขียนรายละเอียดสินค้า | ✅ Done |
| AI แนะนำราคา | วิเคราะห์ราคาตลาดแล้วแนะนำราคาขาย | ✅ Done |

---

## 🔍 Search & Discovery

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| ค้นหาสินค้า | ค้นจาก keyword แบบ realtime | ✅ Done |
| Search Suggestions | แสดง suggestion ขณะพิมพ์ | ✅ Done |
| Advanced Search | กรองด้วย category, condition, price range, location | ✅ Done |
| Filter & Sort | เรียงราคา / ใหม่สุด / กรองสภาพ / จังหวัด | ✅ Done |
| Trending สินค้า | แสดงสินค้าที่กำลังฮิต | ✅ Done |
| Recently Viewed | ประวัติสินค้าที่เคยดู (horizontal scroll) | ✅ Done |
| Saved Searches | บันทึกคีย์เวิร์ด แจ้งเตือนเมื่อมีสินค้าใหม่ตรง | ✅ Done |
| Swipe Mode | สุ่มดูสินค้าแบบ Tinder (drag/swipe) | ✅ Done |
| Category Chips | กรองหมวดหมู่แบบ chip บน homepage | ✅ Done |

---

## 🛒 Cart & Checkout

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| ตะกร้าสินค้า | add/remove/update quantity | ✅ Done |
| Checkout | สร้าง order จาก cart | ✅ Done |
| Promo Code | โค้ดส่วนลดจากผู้ขาย | ✅ Done |
| Bundle Deal | ซื้อหลายชิ้นรวมราคา | ✅ Done |
| PromptPay | ผู้ขายตั้ง PromptPay รับเงิน | ✅ Done |
| แนบ Slip | ผู้ซื้อส่ง slip ยืนยันการโอน | ✅ Done |
| ยืนยันรับสินค้า | กด "รับสินค้าแล้ว" เพื่อปิด order | ✅ Done |
| ยกเลิก Order | ผู้ซื้อ/ผู้ขายยกเลิกได้ | ✅ Done |
| Escrow Wallet | กักเงินก่อนส่ง จ่ายเมื่อรับของแล้ว | 🔲 Round 5 |

---

## 📦 Order Management

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| ประวัติการซื้อ | ดู order ทั้งหมดพร้อม status | ✅ Done |
| ประวัติการขาย | Seller ดู order ที่ได้รับ | ✅ Done |
| Shipping Status | preparing / shipped / received | ✅ Done |
| Tracking Number | ผู้ขายกรอก tracking เลข | ✅ Done |
| Track พัสดุ | เชื่อม API ติดตามพัสดุ EMS/Kerry/Flash | ✅ Done |
| Invoice PDF | ดาวน์โหลด invoice เป็น PDF (jsPDF) | ✅ Done |
| Dispute / แจ้งปัญหา | เปิด dispute พร้อมแนบหลักฐาน | ✅ Done |
| Buyer Protection | ระบบคุ้มครองผู้ซื้อ | 🔲 Round 5 |

---

## 💬 Chat & Communication

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Chat Rooms | แชทระหว่างผู้ซื้อ-ผู้ขาย realtime (Socket.io) | ✅ Done |
| ส่งรูปภาพในแชท | อัปโหลดรูปส่งในห้องแชท | ✅ Done |
| Quick Reply Templates | ปุ่มตอบกลับสำเร็จรูป | ✅ Done |
| Chat Unread Badge | แสดงจำนวนข้อความที่ยังไม่อ่าน | ✅ Done |
| Voice Message | ส่งข้อความเสียงในแชท | ✅ Done |

---

## 💰 Offers & Negotiation

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Make Offer | ผู้ซื้อเสนอราคา + ส่งข้อความ | ✅ Done |
| Incoming/Outgoing Offers | ดู offer ที่ได้รับ / ที่ส่งไป | ✅ Done |
| Accept / Reject Offer | ผู้ขาย approve หรือ reject | ✅ Done |

---

## ❤️ Wishlist & Follows

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Wishlist | บันทึกสินค้าที่ชอบ | ✅ Done |
| ติดตามร้านค้า | Follow / Unfollow seller | ✅ Done |
| Follower Count | แสดงจำนวนผู้ติดตาม | ✅ Done |

---

## ⭐ Reviews & Ratings

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| รีวิวผู้ขาย | rating + comment หลัง order complete | ✅ Done |
| Buyer Review | ผู้ขายรีวิวผู้ซื้อ | ✅ Done |
| คะแนนเฉลี่ย | แสดงคะแนนรวมในโปรไฟล์ร้าน | ✅ Done |

---

## 🏪 Shop / ร้านค้า

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Shop Profile | ชื่อร้าน, bio, banner, สถิติ | ✅ Done |
| Shop Banner Upload | อัปโหลดแบนเนอร์ร้านค้า | ✅ Done |
| Shop Tier Badge | Bronze / Silver / Gold / Diamond ตามยอดขาย | ✅ Done |
| Holiday Mode | ปิดร้านชั่วคราว พร้อมข้อความแจ้ง | ✅ Done |
| Seller Analytics | สถิติยอดขาย, สินค้าดู, รายได้ | ✅ Done |
| Verified Badge | ✅ badge สำหรับร้านที่ admin verify แล้ว | ✅ Done |
| Live Selling | ไลฟ์ขายของ realtime | 🔲 Round 6 |

---

## 🎁 Points & Loyalty

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Points System | 1 pt ต่อ 10 บาท เมื่อซื้อสำเร็จ | ✅ Done |
| Points Log | ประวัติการได้/ใช้แต้ม | ✅ Done |
| Points Balance | ดูแต้มสะสมในหน้าโปรไฟล์ | ✅ Done |
| Referral Reward | รับแต้มเมื่อชวนเพื่อนสมัคร | ✅ Done |

---

## 🔔 Notifications

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Realtime Notifications | Socket.io push notification | ✅ Done |
| แจ้งเตือน order, offer, review | แจ้งทุก event สำคัญ | ✅ Done |
| Mark All Read | อ่านทั้งหมดในครั้งเดียว | ✅ Done |
| ลบ Notification | ลบแต่ละรายการได้ | ✅ Done |
| Saved Search Alert | แจ้งเตือนเมื่อมีสินค้าตรงกับที่บันทึกไว้ | ✅ Done |

---

## 🗺️ Addresses & Shipping

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Address Book | บันทึกที่อยู่จัดส่งหลายรายการ | ✅ Done |
| Default Address | ตั้งที่อยู่หลัก | ✅ Done |
| Map Meetup | นัดรับของโดยเลือกจุดบนแผนที่ | ✅ Done |

---

## 🛡️ Trust & Safety

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Report สินค้า | แจ้งสินค้าที่ไม่เหมาะสม | ✅ Done |
| Dispute System | เปิดเคส dispute พร้อมหลักฐาน | ✅ Done |
| eKYC | ยืนยันตัวตนด้วยบัตรประชาชน | ✅ Done |

---

## 👑 Admin Panel

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Dashboard Stats | จำนวน user, สินค้า, order, รายได้ | ✅ Done |
| จัดการ Users | ค้นหา, ban, verify, toggle admin | ✅ Done |
| จัดการ Products | ดู, อนุมัติ, ลบสินค้า | ✅ Done |
| จัดการ Disputes | รับเรื่อง, อัปเดต status, admin note | ✅ Done |
| จัดการ Reports | ดูรายงาน, อัปเดต status | ✅ Done |
| Verify Requests | รับคำขอ Verified Badge จาก seller | ✅ Done |
| Feedback Center | ดูและจัดการ feedback จากผู้ใช้ | ✅ Done |

---

## 📱 PWA & UX

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| PWA Install | ติดตั้งเป็นแอปบนมือถือ (beforeinstallprompt) | ✅ Done |
| Service Worker | network-first, ไม่ cache HTML | ✅ Done |
| Dark Mode | รองรับ prefers-color-scheme + toggle | ✅ Done |
| QR Share | แชร์สินค้าด้วย QR code | ✅ Done |
| Responsive Design | รองรับทุกขนาดหน้าจอ | ✅ Done |
| Feedback Form | ส่ง feedback ถึงทีม | ✅ Done |

---

## 🌐 Community (Planned)

| Feature | รายละเอียด | สถานะ |
|---------|-----------|-------|
| Community Board | กระดานโพสต์ชุมชน ถาม-ตอบ แชร์ดีล | ✅ Done |
| Story Feed | โพสต์รูป/ข้อความ อยู่ 24 ชม. | ✅ Done |

---

## 📊 สถานะโดยรวม

| Round | Theme | สถานะ |
|-------|-------|-------|
| Round 1 | Core UX — Chat, Quick Reply, Swipe, QR, PWA | ✅ Done |
| Round 2 | Commerce — Flash Sale, Bundle, Reserve, Holiday Mode | ✅ Done |
| Round 3 | Loyalty — Points, Referral, Draft/Schedule, Tier Badge, Invoice | ✅ Done |
| Round 4 | Community — Board, Story, CSV, Watermark, Map | ✅ Done |
| Round 5 | AI & Safety — AI desc, AI price, Track, Escrow, Protection | 🔄 Partial |
| Round 6 | Advanced — Live, Voice, Image Search, eKYC, Biometric | 🔄 Partial |

---

> **Tech Stack:** Node.js + Express, PostgreSQL, Socket.io, Cloudinary, GitHub Pages (frontend), Railway (backend)
