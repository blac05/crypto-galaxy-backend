const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const giftCardSchema = new mongoose.Schema({
  brand:    { type: String, required: true, trim: true },
  type:     { type: String, enum: ['Gift Card', 'Coupon', 'Voucher'], required: true },
  value:    { type: Number, required: true, min: 0 },
  asking:   { type: Number, required: true, min: 0 },
  code:     { type: String, required: true },
  category: { type: String, enum: ['Shopping', 'Entertainment', 'Gaming', 'Tech', 'Food'], default: 'Shopping' },
  expires:  { type: String },
  seller:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerName: { type: String, required: true },
  sellerRating: { type: Number, default: 5.0 },
  totalTrades:  { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  status:   { type: String, enum: ['active', 'sold', 'removed'], default: 'active' },
  trustScore: { type: Number, default: 0 },
  validationResult: { type: Object },
  // Escrow
  escrow: {
    active: { type: Boolean, default: false },
    buyer:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lockedAt: { type: Date },
  },
  // Chat
  chatMessages: [chatMessageSchema],
}, { timestamps: true });

module.exports = mongoose.model('GiftCard', giftCardSchema);
