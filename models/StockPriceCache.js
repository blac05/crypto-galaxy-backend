const mongoose = require("mongoose");

const StockPriceCacheSchema = new mongoose.Schema({
  symbol:   { type: String, required: true, unique: true, uppercase: true },
  price:    { type: Number, required: true },
  open:     { type: Number },
  high:     { type: Number },
  low:      { type: Number },
  prevClose:{ type: Number },
  change:   { type: Number },   // absolute change
  changePct:{ type: Number },   // percentage change
  volume:   { type: Number },
  marketCap:{ type: Number },
  name:     { type: String },
  exchange: { type: String },
  source:   { type: String },   // "alphavantage" | "finnhub" | "mock"
  fetchedAt:{ type: Date, default: Date.now, index: { expires: "2m" } }, // TTL: 2 minutes
});

module.exports = mongoose.model("StockPriceCache", StockPriceCacheSchema);