require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./middleware/authMiddleware');
const { verifyOTP } = require('./utils/otpUtils');
const { sendEmail } = require('./utils/emailUtils');
const { sendSMS } = require('./utils/smsUtils');
const User = require('./models/User');
const Wallet = require('./models/Wallet');
const Transaction = require('./models/Transaction');
const GiftCard = require('./models/GiftCard');
const Stock = require('./models/Stock');
const Crypto = require('./models/Crypto');
const Portfolio = require('./models/Portfolio');
const Watchlist = require('./models/Watchlist');
const Order = require('./models/Order');
const Alert = require('./models/Alert');
const Notification = require('./models/Notification');
const SupportTicket = require('./models/SupportTicket');
const Admin = require('./models/Admin');
const StockPrice = require('./models/StockPrice');
const CryptoPrice = require('./models/CryptoPrice');
const StockNews = require('./models/StockNews');
const CryptoNews = require('./models/CryptoNews');
const Card = require('./models/Card');
const News = require('./models/News');
const StockRoute = require('./models/StockRoute');
const CryptoRoute = require('./models/CryptoRoute');
const PortfolioRoute = require('./models/PortfolioRoute');
const WatchlistRoute = require('./models/WatchlistRoute');
const OrderRoute = require('./models/OrderRoute');
const AlertRoute = require('./models/AlertRoute');
const TransactionRoute = require('./models/TransactionRoute');
const AnalyticsRoute = require('./models/AnalyticsRoute');
const LeaderboardRoute = require('./models/LeaderboardRoute');
const CommunityRoute = require('./models/CommunityRoute');
const NotificationRoute = require('./models/NotificationRoute');
const SupportRoute = require('./models/SupportRoute');
const AdminRoute = require('./models/AdminRoute');
const DevRoute = require('./models/DevRoute');
const StockPriceRoute = require('./models/StockPriceRoute');
const CryptoPriceRoute = require('./models/CryptoPriceRoute');
const StockNewsRoute = require('./models/StockNewsRoute');
const CryptoNewsRoute = require('./models/CryptoNewsRoute');
const stockRoutes = require('./routes/stockRoutes');
const cryptoRoutes = require('./routes/cryptoRoutes');
const portfolioRoutes = require('./routes/portfolioRoutes');
const watchlistRoutes = require('./routes/watchlistRoutes');
const orderRoutes = require('./routes/orderRoutes');
const alertRoutes = require('./routes/alertRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const communityRoutes = require('./routes/communityRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const supportRoutes = require('./routes/supportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const devRoutes = require('./routes/devRoutes');
const stockPriceRoutes = require('./routes/stockPriceRoutes');
const cryptoPriceRoutes = require('./routes/cryptoPriceRoutes');
const stockNewsRoutes = require('./routes/stockNewsRoutes');
const cryptoNewsRoutes = require('./routes/cryptoNewsRoutes');
const cardRoutes = require('./routes/cardRoutes');
const newsRoutes = require('./routes/newsRoutes');
const authRoutes = require('./routes/authRoutes');
const walletRoutes = require('./routes/walletRoutes');
const profileRoutes = require('./routes/profileRoutes');
const giftCardRoutes = require('./routes/giftCardRoutes');
const paymentsRouter = require('./routes/paymentsRoutes');
const marketRouter = require('./routes/marketRoutes');


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
app.use("/api/news", require('./routes/news'));
app.use("/api/stock", require('./routes/stockRoutes'));
app.use("/api/crypto", require('./routes/cryptoRoutes'));
app.use("/api/portfolio", require('./routes/portfolioRoutes'));
app.use("/api/watchlist", require('./routes/watchlistRoutes'));
app.use("/api/orders", require('./routes/orderRoutes'));
app.use("/api/alerts", require('./routes/alertRoutes'));
app.use("/api/transactions", require('./routes/transactionRoutes'));
app.use("/api/analytics", require('./routes/analyticsRoutes'));
app.use("/api/leaderboard", require('./routes/leaderboardRoutes'));
app.use("/api/communities", require('./routes/communityRoutes'));
app.use("/api/notifications", require('./routes/notificationRoutes'));
app.use("/api/support", require('./routes/supportRoutes'));
app.use("/api/admin", require('./routes/adminRoutes'));
app.use("/api/dev", require('./routes/devRoutes'));
app.use("/api/stock-prices", require('./routes/stockPriceRoutes'));
app.use("/api/crypto-prices", require('./routes/cryptoPriceRoutes'));
app.use("/api/stock-news", require('./routes/stockNewsRoutes'));
app.use("/api/crypto-news", require('./routes/cryptoNewsRoutes'));
app.use("/api/cards", require('./routes/cardRoutes'));
app.use("/api/news", require('./routes/newsRoutes'));
app.use("/api/auth", require('./routes/authRoutes'));
app.use("/api/wallet", require('./routes/walletRoutes'));
app.use("/api/profile", require('./routes/profileRoutes'));
app.use("/api/gift-cards", require('./routes/giftCardRoutes'));
app.use("/api/payments", require('./routes/paymentsRoutes'));
app.use("/api/market", require('./routes/marketRoutes'));
app.use("/api/stock", stockRoutes);
app.use("/api/crypto", cryptoRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/communities", communityRoutes);
app.use("/api/notifications", notificationRoutes());
app.use("/api/support", supportRoutes());
app.use("/api/admin", adminRoutes());
app.use("/api/dev", devRoutes());
app.use("/api/stock-prices", stockPriceRoutes);
app.use("/api/crypto-prices", cryptoPriceRoutes());
app.use("/api/stock-news", stockNewsRoutes());
app.use("/api/crypto-news", cryptoNewsRoutes());
app.use("/api/cards", cardRoutes());
app.use("/api/news", newsRoutes());

// Additional routes can be added here (e.g., /api/stock, /api/crypto, etc.)    
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
