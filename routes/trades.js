const express  = require("express");
const router   = express.Router();
const Trade    = require('../models/Trade');     // your existing model
const authMiddleware = require("../middleware/auth");

// ── POST /api/trades ──────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const { coin, type, mode, amount, price } = req.body;

  if (!coin || !type || !amount) return res.status(400).json({ error: "Missing fields" });

  try {
    const trade = await Trade.create({
      userId: req.user.id,
      coin,
      type,          // "buy" | "sell"
      mode,          // "market" | "limit" | "stop"
      amount: Number(amount),
      price:  Number(price) || 0,
      status: mode === "market" ? "filled" : "pending",
      filledAt: mode === "market" ? new Date() : null,
    });

    res.status(201).json({
      id:       trade._id,
      coin:     trade.coin,
      type:     trade.type,
      amount:   trade.amount,
      price:    trade.price,
      status:   trade.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/trades ───────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const trades = await Trade.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;