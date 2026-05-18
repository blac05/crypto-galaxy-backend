const express  = require("express");
const router   = express.Router();
const bcrypt   = require("bcryptjs");
const Card     = require("../models/Card");
const authMiddleware = require("../middleware/auth");  // your existing JWT middleware

// ── Helpers ──────────────────────────────────────────────────
function genCardNumber() {
  const groups = Array.from({ length: 4 }, (_, i) =>
    i === 0 ? "4" + Math.floor(100 + Math.random() * 900)
            : Math.floor(1000 + Math.random() * 9000)
  );
  return groups.join(" ");
}
function genCVV()    { return String(Math.floor(100 + Math.random() * 900)); }
function genExpiry() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 3);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

// ── POST /api/cards/generate ──────────────────────────────────
// Generates (or returns existing active) virtual card for authenticated user
router.post("/generate", authMiddleware, async (req, res) => {
  try {
    let card = await Card.findOne({ userId: req.user.id, active: true });

    if (card) {
      return res.json({
        card: {
          number:  card.number,
          expiry:  card.expiry,
          name:    card.name,
          type:    card.type,
          tier:    card.tier,
          balance: card.balance,
          cvv:     "***",              // never expose real CVV after creation
        },
        existing: true,
      });
    }

    const rawCVV = genCVV();
    const rawNumber = genCardNumber();
    const masked = rawNumber.replace(/(\d{4} \d{4} )(\d{4})( \d{4})/, "$1****$3");

    card = await Card.create({
      userId:   req.user.id,
      number:   masked,
      expiry:   genExpiry(),
      cvvHash:  await bcrypt.hash(rawCVV, 10),
      name:     req.user.name?.toUpperCase() || "GALAXY USER",
      type:     "VISA",
      tier:     "PLATINUM", 
      balance:  0,
    });

    res.status(201).json({
      card: {
        number:  rawNumber,    // show full number only on first creation
        expiry:  card.expiry,
        cvv:     rawCVV,       // show CVV only on first creation
        name:    card.name,
        type:    card.type,
        tier:    card.tier,
        balance: 0,
      },
      existing: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/cards/deposit ───────────────────────────────────
// Deposits from user's crypto wallet balance to card balance
router.post("/deposit", authMiddleware, async (req, res) => {
  const { amount, coin } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

  try {
    // Deduct from user crypto wallet (hook into your existing wallet logic)
    // const User = require("../models/User");
    // const user = await User.findById(req.user.id);
    // if (user.balances[coin] < cryptoAmount) return res.status(400).json({ error: "Insufficient balance" });
    // user.balances[coin] -= cryptoAmount;
    // await user.save();

    const card = await Card.findOne({ userId: req.user.id, active: true });
    if (!card) return res.status(404).json({ error: "No active card" });

    card.balance += Number(amount);
    card.transactions.push({
      merchant:  `Deposit from ${coin} Wallet`,
      amount:    +Number(amount),
      category:  "Deposit",
      status:    "settled",
    });
    await card.save();

    res.json({ success: true, usdAmount: Number(amount), newBalance: card.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/cards/purchase ──────────────────────────────────
// Simulates a card purchase (called when user makes a payment)
router.post("/purchase", authMiddleware, async (req, res) => {
  const { merchant, amount, currency = "USD", category = "Purchase" } = req.body;

  try {
    const card = await Card.findOne({ userId: req.user.id, active: true });
    if (!card) return res.status(404).json({ error: "No active card" });
    if (card.balance < amount) return res.status(400).json({ error: "Insufficient card balance" });

    card.balance -= Number(amount);
    card.transactions.push({ merchant, amount: -Number(amount), currency, category, status: "settled" });
    await card.save();

    res.json({ success: true, newBalance: card.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cards/transactions ───────────────────────────────
// Returns transactions filtered by date range
router.get("/transactions", authMiddleware, async (req, res) => {
  const { range = "30d", filter } = req.query;
  const days = parseInt(range) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const card = await Card.findOne({ userId: req.user.id, active: true });
    if (!card) return res.status(404).json({ error: "No active card" });

    let txns = card.transactions.filter(t => new Date(t.date) >= since);
    if (filter === "deposits")  txns = txns.filter(t => t.amount > 0);
    if (filter === "purchases") txns = txns.filter(t => t.amount < 0);
    if (filter === "pending")   txns = txns.filter(t => t.status === "pending");

    res.json({ transactions: txns.reverse(), balance: card.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});