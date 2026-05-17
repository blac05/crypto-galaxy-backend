const express        = require("express");
const router         = express.Router();
const StockOrder     = require("../models/StockOrder");
const StockPortfolio = require("../models/StockPortfolio");
const StockWatchlist = require("../models/StockWatchlist");
const authMiddleware = require("../middleware/auth");
const {
  getQuote,
  getBatchQuotes,
  searchSymbol,
  getHistory,
} = require("../services/stockPriceFeed");

// ════════════════════════════════════════════════════════════════
// PRICE & MARKET DATA
// ════════════════════════════════════════════════════════════════

// ── GET /api/stocks/quote/:symbol ────────────────────────────
// Returns live quote for a single stock
router.get("/quote/:symbol", async (req, res) => {
  try {
    const quote = await getQuote(req.params.symbol);
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stocks/quotes?symbols=AAPL,MSFT,TSLA ────────────
// Batch quotes for market overview / watchlist
router.get("/quotes", async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "symbols query param required" });

  try {
    const list   = symbols.split(",").map(s => s.trim().toUpperCase()).slice(0, 20);
    const quotes = await getBatchQuotes(list);
    res.json({ quotes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stocks/search?q=apple ───────────────────────────
// Symbol search for the stock finder input
router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.status(400).json({ error: "Query too short" });

  try {
    const results = await searchSymbol(q);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stocks/history/:symbol?range=1m ─────────────────
// OHLCV history for the price chart
router.get("/history/:symbol", async (req, res) => {
  const { range = "1m" } = req.query;
  try {
    const history = await getHistory(req.params.symbol, range);
    res.json({ symbol: req.params.symbol.toUpperCase(), range, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stocks/movers ────────────────────────────────────
// Top gainers and losers for the market overview panel
router.get("/movers", async (req, res) => {
  const DEFAULT_SYMBOLS = [
    "AAPL","MSFT","GOOGL","AMZN","TSLA","NVDA","META","NFLX",
    "AMD","COIN","JPM","BAC","DIS","UBER","SPOT","PLTR","SOFI",
  ];
  try {
    const quotes = await getBatchQuotes(DEFAULT_SYMBOLS);
    const sorted  = [...quotes].sort((a, b) => b.changePct - a.changePct);
    res.json({
      gainers: sorted.filter(q => q.changePct > 0).slice(0, 5),
      losers:  sorted.filter(q => q.changePct < 0).slice(0, 5),
      all:     quotes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ════════════════════════════════════════════════════════════════
// ORDERS
// ════════════════════════════════════════════════════════════════

// ── POST /api/stocks/orders ───────────────────────────────────
// Place a new stock order (buy or sell)
router.post("/orders", authMiddleware, async (req, res) => {
  const {
    symbol, name, exchange,
    side, orderType = "market",
    quantity, limitPrice, stopPrice,
  } = req.body;

  if (!symbol || !side || !quantity)
    return res.status(400).json({ error: "symbol, side, and quantity are required" });
  if (quantity <= 0)
    return res.status(400).json({ error: "Quantity must be positive" });
  if (!["buy","sell"].includes(side))
    return res.status(400).json({ error: "side must be 'buy' or 'sell'" });
  if (!["market","limit","stop","stop_limit"].includes(orderType))
    return res.status(400).json({ error: "Invalid orderType" });

  try {
    // Fetch current price
    const quote = await getQuote(symbol);
    const currentPrice = quote.price;

    // For limit/stop orders, validate prices provided
    if (["limit","stop_limit"].includes(orderType) && !limitPrice)
      return res.status(400).json({ error: "limitPrice required for limit orders" });
    if (["stop","stop_limit"].includes(orderType) && !stopPrice)
      return res.status(400).json({ error: "stopPrice required for stop orders" });

    // ── Portfolio checks ────────────────────────────────────────
    let portfolio = await StockPortfolio.findOne({ userId: req.user.id });
    if (!portfolio) {
      // Auto-create portfolio with $10,000 paper-trading balance
      portfolio = await StockPortfolio.create({ userId: req.user.id });
    }

    const execPrice   = orderType === "market" ? currentPrice : (limitPrice || currentPrice);
    const totalCost   = execPrice * Number(quantity);
    const isMarket    = orderType === "market";

    if (side === "buy") {
      if (isMarket && portfolio.cashBalance < totalCost)
        return res.status(400).json({
          error: `Insufficient cash. Need $${totalCost.toFixed(2)}, have $${portfolio.cashBalance.toFixed(2)}`,
        });
    }

    if (side === "sell") {
      const holding = portfolio.holdings.find(h => h.symbol === symbol.toUpperCase());
      if (!holding || holding.quantity < Number(quantity))
        return res.status(400).json({ error: "Insufficient shares to sell" });
    }

    // ── Create order ────────────────────────────────────────────
    const order = await StockOrder.create({
      userId:         req.user.id,
      symbol:         symbol.toUpperCase(),
      name:           name || quote.name || symbol,
      exchange:       exchange || quote.exchange || "NASDAQ",
      side,
      orderType,
      quantity:       Number(quantity),
      requestedPrice: currentPrice,
      limitPrice:     limitPrice ? Number(limitPrice) : undefined,
      stopPrice:      stopPrice  ? Number(stopPrice)  : undefined,
      filledPrice:    isMarket ? execPrice : undefined,
      filledQuantity: isMarket ? Number(quantity) : 0,
      status:         isMarket ? "filled" : "pending",
      filledAt:       isMarket ? new Date() : undefined,
      totalCost:      isMarket ? totalCost : undefined,
      commission:     0, // paper trading — no commission
    });

    // ── If market order, update portfolio immediately ────────────
    if (isMarket) {
      await _applyFilledOrder(portfolio, order, execPrice);
    }

    res.status(201).json({ order, portfolio: _portfolioSummary(portfolio) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stocks/orders ────────────────────────────────────
// List all orders (with optional status/symbol filter)
router.get("/orders", authMiddleware, async (req, res) => {
  const { status, symbol, limit = 50, page = 1 } = req.query;
  const filter = { userId: req.user.id };
  if (status)  filter.status  = status;
  if (symbol)  filter.symbol  = symbol.toUpperCase();

  try {
    const orders = await StockOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await StockOrder.countDocuments(filter);
    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/stocks/orders/:id ────────────────────────────
// Cancel a pending order
router.delete("/orders/:id", authMiddleware, async (req, res) => {
  try {
    const order = await StockOrder.findOne({ _id: req.params.id, userId: req.user.id });
    if (!order)           return res.status(404).json({ error: "Order not found" });
    if (order.status !== "pending")
      return res.status(400).json({ error: `Cannot cancel a ${order.status} order` });

    order.status      = "cancelled";
    order.cancelledAt = new Date();
    await order.save();

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ════════════════════════════════════════════════════════════════
// PORTFOLIO
// ════════════════════════════════════════════════════════════════

// ── GET /api/stocks/portfolio ─────────────────────────────────
// Full portfolio with live unrealised P&L
router.get("/portfolio", authMiddleware, async (req, res) => {
  try {
    let portfolio = await StockPortfolio.findOne({ userId: req.user.id });
    if (!portfolio) portfolio = await StockPortfolio.create({ userId: req.user.id });

    if (portfolio.holdings.length > 0) {
      // Refresh live prices for all holdings
      const symbols = portfolio.holdings.map(h => h.symbol);
      const quotes  = await getBatchQuotes(symbols);
      const priceMap = Object.fromEntries(quotes.map(q => [q.symbol, q.price]));

      let unrealisedPnl = 0;
      let marketValue   = 0;

      portfolio.holdings = portfolio.holdings.map(h => {
        const livePrice = priceMap[h.symbol] || h.lastPrice;
        const mktVal    = livePrice * h.quantity;
        const unreal    = mktVal - h.totalInvested;
        unrealisedPnl  += unreal;
        marketValue    += mktVal;
        return { ...h.toObject(), lastPrice: livePrice, unrealisedPnl: unreal, marketValue: mktVal };
      });

      portfolio.unrealisedPnl = unrealisedPnl;
      portfolio.totalValue    = portfolio.cashBalance + marketValue;
      await portfolio.save();
    }

    // Attach live prices and pct change to each holding
    const holdingsWithChange = await Promise.all(
      portfolio.holdings.map(async h => {
        const q = await getQuote(h.symbol).catch(() => ({}));
        return { ...h, changePct: q.changePct || 0, change: q.change || 0 };
      })
    );

    res.json({
      portfolio: {
        cashBalance:    portfolio.cashBalance,
        totalDeposited: portfolio.totalDeposited,
        realisedPnl:    portfolio.realisedPnl,
        unrealisedPnl:  portfolio.unrealisedPnl,
        totalValue:     portfolio.totalValue,
        tradeCount:     portfolio.tradeCount,
        winCount:       portfolio.winCount,
        lossCount:      portfolio.lossCount,
        winRate:        portfolio.tradeCount > 0
          ? ((portfolio.winCount / portfolio.tradeCount) * 100).toFixed(1)
          : "0.0",
        holdings: holdingsWithChange,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stocks/portfolio/deposit ───────────────────────
// Deposit cash into stock portfolio from crypto balance
router.post("/portfolio/deposit", authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0)
    return res.status(400).json({ error: "Invalid amount" });

  try {
    let portfolio = await StockPortfolio.findOne({ userId: req.user.id });
    if (!portfolio) portfolio = await StockPortfolio.create({ userId: req.user.id });

    portfolio.cashBalance    += Number(amount);
    portfolio.totalDeposited += Number(amount);
    portfolio.totalValue     += Number(amount);
    await portfolio.save();

    res.json({ success: true, cashBalance: portfolio.cashBalance, totalDeposited: portfolio.totalDeposited });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stocks/portfolio/pnl ────────────────────────────
// Detailed P&L breakdown: per-symbol, per-period
router.get("/portfolio/pnl", authMiddleware, async (req, res) => {
  const { period = "all" } = req.query; // "today" | "week" | "month" | "all"
  try {
    const portfolio = await StockPortfolio.findOne({ userId: req.user.id });
    if (!portfolio) return res.json({ realisedPnl: 0, unrealisedPnl: 0, totalPnl: 0, breakdown: [] });

    // Filter orders by period
    const since = {
      today: new Date(new Date().setHours(0, 0, 0, 0)),
      week:  new Date(Date.now() - 7 * 86400000),
      month: new Date(Date.now() - 30 * 86400000),
      all:   new Date(0),
    }[period] || new Date(0);

    const closedOrders = await StockOrder.find({
      userId:  req.user.id,
      status:  "filled",
      side:    "sell",
      filledAt:{ $gte: since },
    });

    // Per-symbol P&L breakdown
    const bySymbol = {};
    for (const o of closedOrders) {
      if (!bySymbol[o.symbol]) bySymbol[o.symbol] = { symbol: o.symbol, realisedPnl: 0, tradeCount: 0 };
      bySymbol[o.symbol].realisedPnl += (o.realisedPnl || 0);
      bySymbol[o.symbol].tradeCount  += 1;
    }

    res.json({
      realisedPnl:   portfolio.realisedPnl,
      unrealisedPnl: portfolio.unrealisedPnl,
      totalPnl:      portfolio.realisedPnl + portfolio.unrealisedPnl,
      breakdown:     Object.values(bySymbol).sort((a, b) => b.realisedPnl - a.realisedPnl),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ════════════════════════════════════════════════════════════════
// WATCHLIST
// ════════════════════════════════════════════════════════════════

// ── GET /api/stocks/watchlist ─────────────────────────────────
router.get("/watchlist", authMiddleware, async (req, res) => {
  try {
    let wl = await StockWatchlist.findOne({ userId: req.user.id });
    if (!wl) wl = await StockWatchlist.create({ userId: req.user.id, items: [] });

    if (wl.items.length > 0) {
      const symbols = wl.items.map(i => i.symbol);
      const quotes  = await getBatchQuotes(symbols);
      const priceMap = Object.fromEntries(quotes.map(q => [q.symbol, q]));

      wl.items = wl.items.map(item => ({
        ...item.toObject(),
        ...priceMap[item.symbol],
      }));
    }

    res.json({ watchlist: wl.items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stocks/watchlist ────────────────────────────────
// Add a symbol to watchlist
router.post("/watchlist", authMiddleware, async (req, res) => {
  const { symbol, name } = req.body;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  try {
    let wl = await StockWatchlist.findOne({ userId: req.user.id });
    if (!wl) wl = await StockWatchlist.create({ userId: req.user.id, items: [] });

    const exists = wl.items.find(i => i.symbol === symbol.toUpperCase());
    if (exists) return res.status(409).json({ error: "Already in watchlist" });

    const quote = await getQuote(symbol);
    wl.items.push({ symbol: symbol.toUpperCase(), name: name || quote.name || symbol, lastPrice: quote.price });
    await wl.save();

    res.status(201).json({ success: true, watchlist: wl.items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/stocks/watchlist/:symbol ─────────────────────
router.delete("/watchlist/:symbol", authMiddleware, async (req, res) => {
  try {
    const wl = await StockWatchlist.findOne({ userId: req.user.id });
    if (!wl) return res.status(404).json({ error: "Watchlist not found" });

    wl.items = wl.items.filter(i => i.symbol !== req.params.symbol.toUpperCase());
    await wl.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stocks/watchlist/:symbol/alert ─────────────────
// Set a price alert on a watchlisted symbol
router.post("/watchlist/:symbol/alert", authMiddleware, async (req, res) => {
  const { type, targetPrice, targetPct } = req.body;
  if (!type) return res.status(400).json({ error: "Alert type required (above|below|pct_change)" });

  try {
    const wl   = await StockWatchlist.findOne({ userId: req.user.id });
    const item = wl?.items.find(i => i.symbol === req.params.symbol.toUpperCase());
    if (!item) return res.status(404).json({ error: "Symbol not in watchlist" });

    item.alerts.push({ type, targetPrice, targetPct });
    await wl.save();
    res.json({ success: true, alerts: item.alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════

// Applies a filled order to the portfolio document (mutates, call save() after)
async function _applyFilledOrder(portfolio, order, execPrice) {
  const qty    = order.quantity;
  const symbol = order.symbol;
  const cost   = execPrice * qty;

  if (order.side === "buy") {
    portfolio.cashBalance -= cost;

    const existing = portfolio.holdings.find(h => h.symbol === symbol);
    if (existing) {
      // Weighted average cost basis
      const totalQty    = existing.quantity + qty;
      existing.avgCostBasis  = (existing.totalInvested + cost) / totalQty;
      existing.quantity      = totalQty;
      existing.totalInvested += cost;
      existing.lastPrice     = execPrice;
    } else {
      portfolio.holdings.push({
        symbol,
        name:          order.name,
        exchange:      order.exchange,
        quantity:      qty,
        avgCostBasis:  execPrice,
        totalInvested: cost,
        lastPrice:     execPrice,
      });
    }
  } else {
    // SELL
    const holding = portfolio.holdings.find(h => h.symbol === symbol);
    if (holding) {
      const proceeds    = execPrice * qty;
      const costBasis   = holding.avgCostBasis * qty;
      const realisedPnl = proceeds - costBasis;

      holding.quantity      -= qty;
      holding.totalInvested -= costBasis;
      portfolio.cashBalance += proceeds;
      portfolio.realisedPnl += realisedPnl;

      // Persist P&L on the order itself
      order.realisedPnl  = realisedPnl;
      order.avgCostBasis = holding.avgCostBasis;
      await order.save();

      portfolio.tradeCount += 1;
      if (realisedPnl >= 0) portfolio.winCount++;
      else                   portfolio.lossCount++;

      // Remove holding if fully sold
      if (holding.quantity <= 0) {
        portfolio.holdings = portfolio.holdings.filter(h => h.symbol !== symbol);
      }
    }
  }

  await portfolio.save();
}

function _portfolioSummary(portfolio) {
  return {
    cashBalance:   portfolio.cashBalance,
    totalValue:    portfolio.totalValue,
    realisedPnl:   portfolio.realisedPnl,
    unrealisedPnl: portfolio.unrealisedPnl,
    holdingCount:  portfolio.holdings.length,
  };
}

module.exports = router;