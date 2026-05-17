require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const profileRoutes = require('./routes/profileRoutes');
const giftCardRoutes = require('./routes/giftCards');
const { paymentsRouter, marketRouter } = require('./routes/payments');

const app = express();
const server = http.createServer(app);

// ─── Middleware (MUST come before routes) ─────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: function (origin, callback) { callback(null, true); },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please try again later' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many auth attempts. Try again in 15 minutes.' },
});
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ─── Socket.IO Setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
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
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.userId}`);
  userSockets.set(socket.userId, socket.id);

  // ── Gift Card Chat (was outside io.on — fixed) ──
  socket.on('joinChat', ({ chatId }) => socket.join(chatId));
  socket.on('leaveChat', ({ chatId }) => socket.leave(chatId));
  socket.on('chatMessage', (msg) => {
    io.to(msg.chatId).emit('chatMessage', msg);
  });
  socket.on('typing', ({ chatId, senderId }) => {
    socket.to(chatId).emit('userTyping', { senderId });
  });

  socket.on('disconnect', () => {
    userSockets.delete(socket.userId);
    console.log(`🔌 User disconnected: ${socket.userId}`);
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payments', paymentsRouter);
app.use('/api/market', marketRouter);
app.use('/api', profileRoutes);
app.use('/api/gift-cards', giftCardRoutes);
app.use("/api/cards",  require('./routes/cards'));
app.use("/api/news",   require('./routes/news'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '🚀 Crypto Galaxy API is live', timestamp: new Date() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

// ─── Database + Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('🌌 MongoDB connected');
    server.listen(PORT, () => {
      console.log(`🚀 Crypto Galaxy server running on port ${PORT}`);
      console.log(`🔐 Auth: JWT + OTP (email + SMS)`);
      console.log(`📡 Socket.IO: Real-time notifications active`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
