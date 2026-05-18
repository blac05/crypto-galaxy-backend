const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  coin:   { type: String, required: true },
  type:   { type: String, enum: ['buy', 'sell'], required: true },
  mode:   { type: String, enum: ['market', 'limit', 'stop'], default: 'market' },
  amount: { type: Number, required: true, min: 0 },
  price:  { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'filled', 'cancelled'], default: 'pending' },
  filledAt: { type: Date },
}, { timestamps: true });

tradeSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('Trade', tradeSchema);
