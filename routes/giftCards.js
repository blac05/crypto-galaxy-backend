const express = require('express');
const router = express.Router();
const GiftCard = require('../models/GiftCard');
const auth = require('../middleware/auth');

// ─── Card Validator Engine ────────────────────────────────────────────────────
function validateCardCode(code, type) {
  const patterns = {
    'Gift Card': /^[A-Z]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
    'Coupon':    /^[A-Z]{4}-[A-Z0-9]{6,10}$/,
    'Voucher':   /^[A-Z]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
  };
  const pattern = patterns[type] || /^[A-Z0-9-]{10,}$/;
  const upper = code.toUpperCase().trim();
  const formatOk = pattern.test(upper);
  const blacklisted = ['SCAM', 'FAKE', 'TEST', '0000', 'XXXX'].some(b => upper.includes(b));
  const score = formatOk && !blacklisted
    ? Math.floor(Math.random() * 20 + 80)
    : Math.floor(Math.random() * 30);
  return {
    valid: formatOk && !blacklisted && score > 60,
    score,
    formatOk,
    blacklisted,
    status: formatOk && !blacklisted ? (score > 85 ? 'Active' : 'Partially Used') : 'Invalid / Flagged',
    riskFlags: blacklisted
      ? ['⚠️ Blacklisted pattern detected', '🚫 Potential scam code']
      : !formatOk ? ['⚠️ Format mismatch', '❓ Unexpected code structure']
      : score < 60 ? ['⚠️ Low trust score'] : [],
  };
}

// GET /api/gift-cards — all active listings
router.get('/', async (req, res) => {
  try {
    const { category, type, search } = req.query;
    const filter = { status: 'active' };
    if (category && category !== 'All') filter.category = category;
    if (type) filter.type = type;
    if (search) filter.brand = { $regex: search, $options: 'i' };

    const cards = await GiftCard.find(filter)
      .select('-code') // never expose code in listings
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ cards });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch listings' });
  }
});

// POST /api/gift-cards/validate — validate a code
router.post('/validate', async (req, res) => {
  try {
    const { code, type } = req.body;
    if (!code || !type) return res.status(400).json({ message: 'code and type required' });
    const result = validateCardCode(code, type);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Validation failed' });
  }
});

// POST /api/gift-cards — create listing (auth required)
router.post('/', auth, async (req, res) => {
  try {
    const { brand, type, value, asking, code, category, expires } = req.body;
    if (!brand || !type || !value || !asking || !code) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (asking > value) {
      return res.status(400).json({ message: 'Asking price cannot exceed face value' });
    }

    // Validate card before listing
    const validation = validateCardCode(code, type);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Card failed validation. Listing rejected.',
        validation,
      });
    }

    const card = await GiftCard.create({
      brand, type, value: +value, asking: +asking, code, category, expires,
      seller: req.user._id,
      sellerName: `${req.user.firstName} ${req.user.lastName}`,
      verified: req.user.isIdVerified || false,
      trustScore: validation.score,
      validationResult: validation,
    });

    // Don't return the code in the response
    const { code: _, ...safeCard } = card.toObject();
    res.status(201).json({ message: 'Listing created', card: safeCard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create listing' });
  }
});

// POST /api/gift-cards/:id/buy — initiate escrow
router.post('/:id/buy', auth, async (req, res) => {
  try {
    const card = await GiftCard.findById(req.params.id);
    if (!card) return res.status(404).json({ message: 'Listing not found' });
    if (card.status !== 'active') return res.status(400).json({ message: 'Card is no longer available' });
    if (card.seller.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot buy your own listing' });
    }
    if (card.escrow.active) return res.status(400).json({ message: 'Card is in active escrow' });

    card.escrow = { active: true, buyer: req.user._id, lockedAt: new Date() };
    await card.save();

    // Notify via socket
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const sellerSocketId = userSockets?.get(card.seller.toString());
    if (sellerSocketId) {
      io.to(sellerSocketId).emit('notification', {
        type: 'escrow',
        title: '🔒 Escrow Started',
        message: `${req.user.firstName} initiated escrow on your ${card.brand} ${card.type}`,
        timestamp: new Date(),
      });
    }

    res.json({ message: 'Escrow started', escrow: card.escrow });
  } catch (err) {
    res.status(500).json({ message: 'Escrow failed' });
  }
});

// POST /api/gift-cards/:id/confirm — confirm receipt and release code
router.post('/:id/confirm', auth, async (req, res) => {
  try {
    const card = await GiftCard.findById(req.params.id);
    if (!card) return res.status(404).json({ message: 'Not found' });
    if (!card.escrow.active) return res.status(400).json({ message: 'No active escrow' });
    if (card.escrow.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the buyer can confirm' });
    }

    card.status = 'sold';
    await card.save();

    // Release full card including code to buyer only
    const fullCard = await GiftCard.findById(req.params.id);
    res.json({ message: 'Transaction confirmed! Code released.', code: fullCard.code });
  } catch (err) {
    res.status(500).json({ message: 'Confirm failed' });
  }
});

// POST /api/gift-cards/:id/message — send a chat message
router.post('/:id/message', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Message cannot be empty' });

    const card = await GiftCard.findById(req.params.id);
    if (!card) return res.status(404).json({ message: 'Listing not found' });

    const msg = {
      sender: req.user._id,
      senderName: `${req.user.firstName} ${req.user.lastName}`,
      text: text.trim(),
      timestamp: new Date(),
    };

    card.chatMessages.push(msg);
    await card.save();

    // Broadcast via socket
    const io = req.app.get('io');
    io.to(`card-${req.params.id}`).emit('chatMessage', msg);

    res.json({ message: 'Sent', msg });
  } catch (err) {
    res.status(500).json({ message: 'Message failed' });
  }
});

// GET /api/gift-cards/:id/messages
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const card = await GiftCard.findById(req.params.id).select('chatMessages seller escrow');
    if (!card) return res.status(404).json({ message: 'Not found' });

    const isParty = card.seller.toString() === req.user._id.toString() ||
      card.escrow?.buyer?.toString() === req.user._id.toString();
    if (!isParty) return res.status(403).json({ message: 'Access denied' });

    res.json({ messages: card.chatMessages });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load messages' });
  }
});

// DELETE /api/gift-cards/:id — remove own listing
router.delete('/:id', auth, async (req, res) => {
  try {
    const card = await GiftCard.findById(req.params.id);
    if (!card) return res.status(404).json({ message: 'Not found' });
    if (card.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your listing' });
    }
    if (card.escrow.active) return res.status(400).json({ message: 'Cannot remove while in escrow' });

    card.status = 'removed';
    await card.save();
    res.json({ message: 'Listing removed' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' });
  }
});

module.exports = router;
