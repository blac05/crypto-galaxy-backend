const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['buy', 'sell', 'send', 'receive', 'payment'], required: true },
  coin: { type: String, enum: ['BTC', 'ETH', 'SOL', 'USDT'], required: true },
  amount: { type: Number, required: true },
  usdValue: { type: Number },
  fee: { type: Number, default: 0 },
  toAddress: { type: String },
  fromAddress: { type: String },
  paymentMethod: { type: String },
  paymentReference: { type: String },
  note: { type: String },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending' },
  txHash: { type: String },
  confirmedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
