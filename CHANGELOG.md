# Changelog

All notable changes to PloiKhong backend are documented here.

---

## [Unreleased] — 2026-04-22

### Added
- **GET /api/products/categories** — returns real `COUNT(*)` per category from DB, plus grand total; only counts `available`/`reserved` non-draft products with valid `publish_at`
- **PATCH /api/auth/preferences** — dynamic SQL update for `bg_color`, `dark_mode`, `remember_prefs` (only updates fields provided in body)
- **GET /api/auth/me** — now returns `bg_color`, `dark_mode`, `remember_prefs` columns alongside user data
- **Admin stats: `revenue_sources`** — `/api/coins/admin/stats` now includes `revenue_sources` array breaking down revenue by source (coin purchases, future transaction fees) and `feature_usage` array with `estimated_baht` per feature key
- **DB migrations** — added three columns to `users` table: `bg_color VARCHAR(20)`, `dark_mode INTEGER DEFAULT 0`, `remember_prefs INTEGER DEFAULT 1`
- **Admin seed account** — `admin@ploikhong.com` / `admin1234` created via `db.js` seed

### Changed
- `/api/coins/admin/stats` response shape extended: `feature_usage` entries now include `coins_spent` and `estimated_baht` (calculated as `coins_spent × avgCoinValue` where `avgCoinValue = totalRevenueBaht / totalCoinsIssued`)
- Revenue sources include a placeholder `transaction_fees` row (total=0) ready for future implementation

---

## [0.5.0] — Premium & Coins

### Added
- Coin packages + PromptPay payment flow
- `POST /api/coins/request-payment` — submit payment request with slip URL
- `POST /api/coins/activate-feature` — spend coins to activate premium features (featured, auto_relist, price_alert, analytics_pro, priority_support)
- `GET /api/coins/active-features` — list currently active features for user
- `GET /api/coins/payment-requests/my` — user's payment history
- Admin: `POST /api/coins/payment-requests/:id/confirm` and `/reject`
- Cron job (daily) for auto-relist feature

---

## [0.4.0] — Social Features

### Added
- **Follows** — `POST /api/follows/toggle`, `GET /api/follows`, `GET /api/follows/status/:id`, `GET /api/follows/count/:id`
- **Notifications** — `GET /api/notifications`, `POST /api/notifications/read-all`
- **Shop page** — `GET /api/shop/:userId`
- **Offers** — `POST /api/offers`, `GET /api/offers/incoming`, `GET /api/offers/outgoing`, `PATCH /api/offers/:id`

---

## [0.3.0] — Analytics

### Added
- Event tracking: `POST /api/analytics/event` (view / wishlist / chat_open / offer / share)
- Seller analytics: `GET /api/analytics/seller`
- AI Recommendations: `GET /api/analytics/recommendations/:productId` (Analytics Pro gated)

---

## [0.2.0] — Chat & Real-time

### Added
- Socket.io real-time chat
- `POST /api/chat/rooms` — create room
- `GET /api/chat/rooms` — list rooms for user
- `GET /api/chat/rooms/:id/messages` — fetch messages
- `POST /api/chat/rooms/:id/messages` — send message
- `POST /api/chat/rooms/:id/image` — send image via Cloudinary
- `GET /api/chat/unread` — unread count badge

---

## [0.1.0] — Core Marketplace

### Added
- Express + PostgreSQL (Railway) setup
- JWT auth: register, login, social login (Google/Facebook)
- Products CRUD with Cloudinary image upload
- Wishlist toggle
- Admin panel endpoints
