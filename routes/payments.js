const express      = require('express');
const router       = express.Router();
const { v4: uuidv4 } = require('uuid');
const Transaction  = require('../models/Transaction');
const User         = require('../models/User');
const auth         = require('../middleware/auth');
const { sendEmail, sendSms, templates } = require('../services/notificationService');

// POST /api/payments/initiate
router.post('/initiate', auth, async (req, res) => {
  try {
    const { method, coin, amount } = req.body;
    if (!method || !coin || !amount || amount <= 0)
      return res.status(400).json({ message: 'Invalid payment parameters' });

    const reference = 'CGX-' + uuidv4().toUpperCase().slice(0, 12);
    const tx = await Transaction.create({
      user: req.user._id, type: 'payment', coin, amount,
      usdValue: amount, paymentMethod: method,
      paymentReference: reference, status: 'pending',
    });
    const user = await User.findById(req.user._id);

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const socketId = userSockets?.get(req.user._id.toString());
    if (socketId) {
      io.to(socketId).emit('notification', {
        type: 'transaction', title: 'Payment Initiated',
        message: `Payment of $${amount} via ${method} initiated. Ref: ${reference}`,
        timestamp: new Date(),
      });
    }
    if (user.notifications?.transaction) {
      await sendEmail(user.email, templates.transactionAlert(user.firstName, 'payment', amount, coin, 'pending', reference));
      await sendSms(user.phone, `💳 Payment of $${amount} via ${method} initiated. Ref: ${reference}`);
    }

    setTimeout(async () => {
      tx.status = 'completed'; tx.confirmedAt = new Date(); await tx.save();
      await User.findByIdAndUpdate(req.user._id, { $inc: { [`wallet.${coin}`]: amount / 45000 } });
      if (socketId) {
        io.to(socketId).emit('transactionUpdate', { status: 'completed', amount, coin, type: 'payment' });
        io.to(socketId).emit('notification', { type: 'transaction', title: '✅ Payment Confirmed', message: `Payment of $${amount} confirmed.`, timestamp: new Date() });
      }
      if (user.notifications?.transaction) {
        await sendEmail(user.email, templates.transactionAlert(user.firstName, 'payment', amount, coin, 'completed', reference));
      }
    }, 30000);

    res.json({ message: 'Payment initiated', reference, transactionId: tx._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Payment initiation failed' });
  }
});

// GET /api/payments/prices — live crypto prices (mock with jitter)
let _cachedPrices = { BTC: 67450, ETH: 3820, SOL: 178, USDT: 1 };
let _lastFetched  = 0;
router.get('/prices', async (req, res) => {
  const now = Date.now();
  if (now - _lastFetched > 30000) {
    _cachedPrices = {
      BTC:  67450 + (Math.random() - 0.5) * 500,
      ETH:  3820  + (Math.random() - 0.5) * 80,
      SOL:  178   + (Math.random() - 0.5) * 5,
      USDT: 1,
    };
    _lastFetched = now;
  }
  res.json({ prices: _cachedPrices });
});

module.exports = router;
