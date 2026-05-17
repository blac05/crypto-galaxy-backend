const mongoose = require("mongoose");

const HoldingSchema = new mongoose.Schema(
  {
    symbol:        { type: String, required: true, uppercase: true },
    name:          { type: String },
    exchange:      { type: String },
    quantity:      { type: Number, required: true, min: 0 },      // total shares held
    avgCostBasis:  { type: Number, required: true },              // weighted avg purchase price
    totalInvested: { type: Number, required: true },              // quantity × avgCostBasis
    lastPrice:     { type: Number, default: 0 },                  // cached current price
    lastUpdated:   { type: Date, default: Date.now },
    sector:        { type: String },
  },
  { _id: false }
);

const StockPortfolioSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    cashBalance:    { type: Number, default: 10000 }, // virtual buying power (USD)
    totalDeposited: { type: Number, default: 10000 }, // lifetime deposits

    holdings: [HoldingSchema],

    // ── Running P&L summary ─────────────────────────────────────
    realisedPnl:   { type: Number, default: 0 },  // locked-in profit/loss from closed trades
    unrealisedPnl: { type: Number, default: 0 },  // current open position P&L (recalculated)
    totalValue:    { type: Number, default: 10000 }, // cashBalance + holdings market value

    // ── Stats ───────────────────────────────────────────────────
    tradeCount:    { type: Number, default: 0 },
    winCount:      { type: Number, default: 0 },   // closed trades with positive P&L
    lossCount:     { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StockPortfolio", StockPortfolioSchema);