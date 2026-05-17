const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
  merchant:  { type: String, required: true },
  amount:    { type: Number, required: true },          // positive = deposit, negative = purchase
  currency:  { type: String, default: "USD" },
  category:  { type: String, default: "Purchase" },
  status:    { type: String, enum: ["pending","settled","failed"], default: "pending" },
  date:      { type: Date, default: Date.now },
});

const CardSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  number:       { type: String, required: true },        // store masked, e.g. "4123 **** **** 4567"
  expiry:       { type: String, required: true },
  cvvHash:      { type: String, required: true },        // bcrypt hash of CVV
  name:         { type: String, default: "GALAXY USER" },
  type:         { type: String, default: "VISA" },
  tier:         { type: String, default: "PLATINUM" },
  balance:      { type: Number, default: 0 },
  active:       { type: Boolean, default: true },
  transactions: [TransactionSchema],
  createdAt:    { type: Date, default: Date.now },
});

module.exports = mongoose.model("Card", CardSchema);