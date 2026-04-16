// v20260419a
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { SECRET } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const userRoutes = require('./routes/users');
const cartRoutes = require('./routes/cart');
const wishlistRoutes = require('./routes/wishlist');
const chatRoutes = require('./routes/chat');
const reviewRoutes = require('./routes/reviews');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');
const offerRoutes = require('./routes/offers');
const orderRoutes = require('./routes/orders');
const followRoutes = require('./routes/follows');
const shopRoutes = require('./routes/shop');
const addressRoutes = require('./routes/addresses');
const buyerReviewRoutes = require('./routes/buyer-reviews');
const savedSearchRoutes = require('./routes/saved-searches');
const disputeRoutes = require('./routes/disputes');
const promoRoutes = require('./routes/promo');
const feedbackRoutes = require('./routes/feedback');
const bundleRoutes = require('./routes/bundles');
const communityRoutes = require('./routes/community');
const storyRoutes = require('./routes/stories');

const { initDB, getDB } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', credentials: true }
});

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/buyer-reviews', buyerReviewRoutes);
app.use('/api/saved-searches', savedSearchRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/bundles', bundleRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/stories', storyRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health/cloudinary', async (req, res) => {
  const { cloudinary } = require('./cloudinary');
  const cfg = cloudinary.config();
  res.json({
    cloud_name: cfg.cloud_name || 'NOT SET',
    api_key: cfg.api_key || 'NOT SET',
    api_secret: cfg.api_secret ? cfg.api_secret.slice(0,4)+'***' : 'NOT SET',
  });
});

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    socket.user = jwt.verify(token, SECRET);
    next();
  } catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);

  socket.on('join_room', (roomId) => socket.join(roomId));

  socket.on('send_message', async (data) => {
    try {
      const db = getDB();
      const { room_id, content } = data;
      const { rows: mr } = await db.query('INSERT INTO messages (room_id, sender_id, content) VALUES ($1,$2,$3) RETURNING id', [room_id, userId, content]);
      const { rows: fm } = await db.query('SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1', [mr[0].id]);
      const fullMsg = fm[0];
      io.to(room_id).emit('new_message', fullMsg);
      const { rows: rr } = await db.query('SELECT * FROM chat_rooms WHERE id = $1', [room_id]);
      const room = rr[0];
      if (room) {
        const otherId = room.buyer_id === userId ? room.seller_id : room.buyer_id;
        await db.query("INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,'chat','ข้อความใหม่',$2,$3)", [otherId, `${socket.user.name}: ${content.slice(0,40)}`, `/chat/${room_id}`]);
        const otherSocket = onlineUsers.get(otherId);
        if (otherSocket) io.to(otherSocket).emit('notification', { type: 'chat' });
      }
    } catch (e) { console.error('send_message error:', e); }
  });

  socket.on('disconnect', () => onlineUsers.delete(userId));
});

app.set('io', io);
app.set('onlineUsers', onlineUsers);

initDB().then(() => {
  server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize DB:', err);
  process.exit(1);
});
