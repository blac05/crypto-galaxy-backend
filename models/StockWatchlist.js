const mongoose = require("mongoose");

const AlertSchema = new mongoose.Schema(
  {
    type:        { type: String, enum: ["above", "below", "pct_change"], required: true },
    targetPrice: { type: Number },
    targetPct:   { type: Number },
    triggered:   { type: Boolean, default: false },
    triggeredAt: { type: Date },
  },
  { _id: false }
);

const WatchlistItemSchema = new mongoose.Schema(
  {
    symbol:    { type: String, required: true, uppercase: true },
    name:      { type: String },
    addedAt:   { type: Date, default: Date.now },
    notes:     { type: String },
    alerts:    [AlertSchema],
    lastPrice: { type: Number, default: 0 },
  },
  { _id: false }
);

const StockWatchlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [WatchlistItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("StockWatchlist", StockWatchlistSchema);