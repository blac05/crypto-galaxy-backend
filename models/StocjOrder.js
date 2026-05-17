const mongoose = require("mongoose");

const StockOrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ── Instrument ──────────────────────────────────────────────
    symbol:    { type: String, required: true, uppercase: true }, // e.g. "AAPL"
    name:      { type: String },                                  // e.g. "Apple Inc."
    exchange:  { type: String, default: "NASDAQ" },               // NYSE | NASDAQ | etc.

    // ── Order details ───────────────────────────────────────────
    side:      { type: String, enum: ["buy", "sell"], required: true },
    orderType: { type: String, enum: ["market", "limit", "stop", "stop_limit"], default: "market" },
    quantity:  { type: Number, required: true, min: 0.001 },      // supports fractional shares

    // Prices (all in USD)
    requestedPrice: { type: Number },   // price at time of order submission
    limitPrice:     { type: Number },   // for limit / stop_limit orders
    stopPrice:      { type: Number },   // for stop / stop_limit orders
    filledPrice:    { type: Number },   // actual execution price

    // ── Status lifecycle ────────────────────────────────────────
    // pending → filled | cancelled | rejected | expired
    status: {
      type: String,
      enum: ["pending", "filled", "partially_filled", "cancelled", "rejected", "expired"],
      default: "pending",
      index: true,
    },
    filledQuantity: { type: Number, default: 0 },
    filledAt:       { type: Date },
    cancelledAt:    { type: Date },
    expiresAt:      { type: Date },      // for GTC / day orders

    // ── Financials ──────────────────────────────────────────────
    totalCost:    { type: Number },      // filledPrice × filledQuantity
    commission:   { type: Number, default: 0 },
    currency:     { type: String, default: "USD" },

    // ── P&L (computed at fill time) ─────────────────────────────
    // For sell orders, store realised P&L
    realisedPnl:    { type: Number },
    avgCostBasis:   { type: Number },    // average cost of the lot being sold

    notes: { type: String },
  },
  { timestamps: true }
);

// Index for fast portfolio queries
StockOrderSchema.index({ userId: 1, symbol: 1, status: 1 });
StockOrderSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("StockOrder", StockOrderSchema);