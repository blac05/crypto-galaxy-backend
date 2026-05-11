const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendEmail, sendSms, templates } = require('../services/notificationService');

// POST /api/payments/initiate
router.post('/initiate', auth, async (req, res) => {
  try {
    const { method, coin, amount, details } = req.body;
    if (!method || !coin || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid payment parameters' });
    }

    const reference = 'CGX-' + uuidv4().toUpperCase().slice(0, 12);

    const tx = await Transaction.create({
      user: req.user._id,
      type: 'payment',
      coin,
      amount,
      usdValue: amount,
      paymentMethod: method,
      paymentReference: reference,
      status: 'pending',
    });

    const user = await User.findById(req.user._id);

    // Notify user
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const socketId = userSockets?.get(req.user._id.toString());
    if (socketId) {
      io.to(socketId).emit('notification', {
        type: 'transaction',
        title: 'Payment Initiated',
        message: `Payment of $${amount} via ${method} is being processed. Ref: ${reference}`,
        timestamp: new Date(),
      });
    }

    if (user.notifications?.transaction) {
      await sendEmail(user.email, templates.transactionAlert(user.firstName, 'payment', amount, coin, 'pending', reference));
      await sendSms(user.phone, `💳 Crypto Galaxy: Payment of $${amount} via ${method} initiated. Ref: ${reference}`);
    }

    // Simulate auto-complete after 30 seconds (in production, use a webhook)
    setTimeout(async () => {
      tx.status = 'completed';
      tx.confirmedAt = new Date();
      await tx.save();

      // Credit wallet
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { [`wallet.${coin}`]: amount / 45000 }, // simplified conversion
      });

      if (socketId) {
        io.to(socketId).emit('transactionUpdate', { status: 'completed', amount, coin, type: 'payment' });
        io.to(socketId).emit('notification', {
          type: 'transaction',
          title: '✅ Payment Confirmed',
          message: `Your payment of $${amount} has been confirmed. ${coin} added to wallet.`,
          timestamp: new Date(),
        });
      }

      if (user.notifications?.transaction) {
        await sendEmail(user.email, templates.transactionAlert(user.firstName, 'payment', amount, coin, 'completed', reference));
        await sendSms(user.phone, `✅ Crypto Galaxy: Payment of $${amount} CONFIRMED! ${coin} added to your wallet. Ref: ${reference}`);
      }
    }, 30000);

    res.json({ message: 'Payment initiated', reference, transactionId: tx._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Payment initiation failed' });
  }
});

module.exports = router;

// ─── Market prices route (separate file export) ───────────────────────────────
const marketRouter = express.Router();

// Mock prices (in production, fetch from CoinGecko or Binance API)
let cachedPrices = { BTC: 67450, ETH: 3820, SOL: 178, USDT: 1 };
let lastFetched = 0;

marketRouter.get('/prices', async (req, res) => {
  try {
    // Add small random fluctuation for realism in dev
    const now = Date.now();
    if (now - lastFetched > 30000) {
      cachedPrices = {
        BTC: 67450 + (Math.random() - 0.5) * 500,
        ETH: 3820 + (Math.random() - 0.5) * 80,
        SOL: 178 + (Math.random() - 0.5) * 5,
        USDT: 1,
      };
      lastFetched = now;
    }
    res.json({ prices: cachedPrices });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch prices' });
  }
});

module.exports.paymentsRouter = router;
module.exports.marketRouter = marketRouter;
