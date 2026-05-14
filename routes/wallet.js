const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User').default;
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const { sendEmail, sendSms, templates } = require('../services/notificationService');

// GET /api/wallet/balances
router.get('/balances', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('wallet');
    res.json({ balances: user.wallet });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch balances' });
  }
});

// GET /api/wallet/transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const txs = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ transactions: txs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

// POST /api/wallet/send
router.post('/send', auth, async (req, res) => {
  try {
    const { coin, amount, toAddress, note } = req.body;
    if (!coin || !amount || !toAddress) return res.status(400).json({ message: 'Missing required fields' });
    if (amount <= 0) return res.status(400).json({ message: 'Amount must be positive' });

    const user = await User.findById(req.user._id);
    if ((user.wallet[coin] || 0) < amount) return res.status(400).json({ message: 'Insufficient balance' });

    // Deduct balance
    user.wallet[coin] -= amount;
    await user.save();

    const tx = await Transaction.create({
      user: req.user._id,
      type: 'send',
      coin,
      amount,
      toAddress,
      note,
      status: 'completed',
      txHash: '0x' + uuidv4().replace(/-/g, ''),
      confirmedAt: new Date(),
    });

    // Notify via Socket.IO
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const socketId = userSockets?.get(req.user._id.toString());
    if (socketId) {
      io.to(socketId).emit('transactionUpdate', { status: 'completed', amount, coin, type: 'send' });
      io.to(socketId).emit('notification', {
        type: 'transaction',
        title: 'Transaction Sent',
        message: `Successfully sent ${amount} ${coin}`,
        timestamp: new Date(),
      });
    }

    // Email + SMS notification
    if (user.notifications?.transaction) {
      await sendEmail(user.email, templates.transactionAlert(user.firstName, 'send', amount, coin, 'completed', tx._id));
      await sendSms(user.phone, `💸 Crypto Galaxy: You sent ${amount} ${coin}. TX: ${tx._id.toString().slice(-8)}`);
    }

    res.json({ message: 'Transaction sent successfully', transaction: tx });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Transaction failed' });
  }
});

// POST /api/wallet/buy
router.post('/buy', auth, async (req, res) => {
  try {
    const { coin, amount, usd } = req.body;
    if (!coin || !amount || amount <= 0) return res.status(400).json({ message: 'Invalid buy parameters' });

    const user = await User.findById(req.user._id);
    user.wallet[coin] = (user.wallet[coin] || 0) + amount;
    await user.save();

    const tx = await Transaction.create({
      user: req.user._id,
      type: 'buy',
      coin,
      amount,
      usdValue: usd,
      fee: usd * 0.0025,
      status: 'completed',
      confirmedAt: new Date(),
    });

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const socketId = userSockets?.get(req.user._id.toString());
    if (socketId) {
      io.to(socketId).emit('transactionUpdate', { status: 'completed', amount, coin, type: 'buy' });
      io.to(socketId).emit('notification', {
        type: 'transaction',
        title: 'Purchase Complete',
        message: `Bought ${amount} ${coin} for $${usd}`,
        timestamp: new Date(),
      });
    }

    if (user.notifications?.transaction) {
      await sendEmail(user.email, templates.transactionAlert(user.firstName, 'buy', amount, coin, 'completed', tx._id));
      await sendSms(user.phone, `🛒 Crypto Galaxy: You purchased ${amount} ${coin}. TX: ${tx._id.toString().slice(-8)}`);
    }

    res.json({ message: 'Purchase successful', transaction: tx });
  } catch (err) {
    res.status(500).json({ message: 'Purchase failed' });
  }
});

// POST /api/wallet/sell
router.post('/sell', auth, async (req, res) => {
  try {
    const { coin, amount, usd } = req.body;
    if (!coin || !amount || amount <= 0) return res.status(400).json({ message: 'Invalid sell parameters' });

    const user = await User.findById(req.user._id);
    if ((user.wallet[coin] || 0) < amount) return res.status(400).json({ message: 'Insufficient balance' });

    user.wallet[coin] -= amount;
    await user.save();

    const tx = await Transaction.create({
      user: req.user._id,
      type: 'sell',
      coin,
      amount,
      usdValue: usd,
      fee: usd * 0.0025,
      status: 'completed',
      confirmedAt: new Date(),
    });

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const socketId = userSockets?.get(req.user._id.toString());
    if (socketId) {
      io.to(socketId).emit('transactionUpdate', { status: 'completed', amount, coin, type: 'sell' });
    }

    if (user.notifications?.transaction) {
      await sendEmail(user.email, templates.transactionAlert(user.firstName, 'sell', amount, coin, 'completed', tx._id));
    }

    res.json({ message: 'Sale successful', transaction: tx });
  } catch (err) {
    res.status(500).json({ message: 'Sale failed' });
  }
});

module.exports = router;
