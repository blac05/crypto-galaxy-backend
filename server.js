require('dotenv').config();
const express   = require('express');
const http      = require('http');
const { Server }= require('socket.io');
const mongoose  = require('mongoose');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt       = require('jsonwebtoken');

// ─── Routes (only files that ACTUALLY EXIST) ─────────────────
const authRoutes     = require('./routes/auth');
const walletRoutes   = require('./routes/wallet');
const profileRoutes  = require('./routes/profileRoutes');
const giftCardRoutes = require('./routes/giftCards');
const paymentsRoutes = require('./routes/payments');
const cardRoutes     = require('./routes/cards');
const newsRoutes     = require('./routes/news');
const stockRoutes    = require('./routes/stocks');
const tradeRoutes    = require('./routes/trades');

const app    = express();
const server = http.createServer(app);

// ─── Core middleware ──────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: function (o, cb) { cb(null, true); }, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 100, message: { message: 'Too many requests' } }));
app.use('/api/auth/', rateLimit({ windowMs: 15*60*1000, max: 10, message: { message: 'Too many auth attempts' } }));

// ─── Socket.IO ────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', methods: ['GET','POST'], credentials: true },
});
const userSockets = new Map();
app.set('io', io);
app.set('userSockets', userSockets);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  console.log('🔌 Connected:', socket.userId);
  userSockets.set(socket.userId, socket.id);
  socket.on('joinChat',    ({ chatId }) => socket.join(chatId));
  socket.on('leaveChat',   ({ chatId }) => socket.leave(chatId));
  socket.on('chatMessage', (msg)        => io.to(msg.chatId).emit('chatMessage', msg));
  socket.on('typing',      ({ chatId, senderId }) => socket.to(chatId).emit('userTyping', { senderId }));
  socket.on('disconnect',  () => { userSockets.delete(socket.userId); console.log('🔌 Disconnected:', socket.userId); });
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/wallet',     walletRoutes);
app.use('/api/profile',    profileRoutes);
app.use('/api/gift-cards', giftCardRoutes);
app.use('/api/payments',   paymentsRoutes);
app.use('/api/cards',      cardRoutes);
app.use('/api/news',       newsRoutes);
app.use('/api/stocks',     stockRoutes);
app.use('/api/trades',     tradeRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: '🚀 Crypto Galaxy API is live', timestamp: new Date() }));

app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ message: 'Internal server error' }); });

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('🌌 MongoDB connected');
    server.listen(PORT, () => console.log(`🚀 Crypto Galaxy running on port ${PORT}`));
  })
  .catch(err => { console.error('❌ MongoDB failed:', err.message); process.exit(1); });
