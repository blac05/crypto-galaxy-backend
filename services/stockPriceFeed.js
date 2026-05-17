const axios = require("axios");
const StockPriceCache = require("../models/StockPriceCache");

const AV_KEY  = process.env.ALPHA_VANTAGE_KEY;
const FH_KEY  = process.env.FINNHUB_KEY;

// ── Fetch a single quote, using cache first ──────────────────
async function getQuote(symbol) {
  symbol = symbol.toUpperCase();

  // 1. Check cache (TTL is handled by MongoDB index on fetchedAt)
  try {
    const cached = await StockPriceCache.findOne({ symbol });
    if (cached) return cached.toObject();
  } catch (_) {}

  // 2. Try Alpha Vantage
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV_KEY}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    const q = data["Global Quote"];

    if (q && q["05. price"]) {
      const price     = parseFloat(q["05. price"]);
      const prevClose = parseFloat(q["08. previous close"]);
      const change    = parseFloat(q["09. change"]);
      const changePct = parseFloat(q["10. change percent"]?.replace("%", ""));

      const doc = {
        symbol,
        price,
        open:      parseFloat(q["02. open"]),
        high:      parseFloat(q["03. high"]),
        low:       parseFloat(q["04. low"]),
        prevClose,
        change,
        changePct,
        volume:    parseInt(q["06. volume"]),
        source:    "alphavantage",
        fetchedAt: new Date(),
      };

      await StockPriceCache.findOneAndUpdate({ symbol }, doc, { upsert: true, new: true });
      return doc;
    }
  } catch (e) {
    console.warn(`[StockPriceFeed] Alpha Vantage failed for ${symbol}:`, e.message);
  }

  // 3. Fallback: Finnhub
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FH_KEY}`;
    const { data } = await axios.get(url, { timeout: 5000 });

    if (data && data.c) {
      const price     = data.c;
      const prevClose = data.pc;
      const change    = price - prevClose;
      const changePct = ((change / prevClose) * 100);

      const doc = {
        symbol,
        price,
        open:      data.o,
        high:      data.h,
        low:       data.l,
        prevClose,
        change,
        changePct,
        volume:    data.v || 0,
        source:    "finnhub",
        fetchedAt: new Date(),
      };

      await StockPriceCache.findOneAndUpdate({ symbol }, doc, { upsert: true, new: true });
      return doc;
    }
  } catch (e) {
    console.warn(`[StockPriceFeed] Finnhub failed for ${symbol}:`, e.message);
  }

  // 4. Last resort: return mock price with a warning flag
  return {
    symbol,
    price:     100 + Math.random() * 50,
    changePct: (Math.random() - 0.5) * 4,
    change:    (Math.random() - 0.5) * 3,
    source:    "mock",
    warning:   "Live price unavailable — using mock data",
  };
}

// ── Batch fetch multiple symbols ─────────────────────────────
async function getBatchQuotes(symbols) {
  const results = await Promise.allSettled(symbols.map(getQuote));
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { symbol: symbols[i], price: 0, error: r.reason?.message }
  );
}

// ── Search for a stock symbol ─────────────────────────────────
async function searchSymbol(query) {
  try {
    // Alpha Vantage symbol search
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${AV_KEY}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    const matches = (data.bestMatches || []).map(m => ({
      symbol:   m["1. symbol"],
      name:     m["2. name"],
      type:     m["3. type"],
      region:   m["4. region"],
      currency: m["8. currency"],
    }));
    return matches.slice(0, 10);
  } catch {
    // Static fallback list
    const POPULAR = [
      { symbol: "AAPL", name: "Apple Inc.", type: "Equity", region: "United States" },
      { symbol: "MSFT", name: "Microsoft Corporation", type: "Equity", region: "United States" },
      { symbol: "GOOGL", name: "Alphabet Inc.", type: "Equity", region: "United States" },
      { symbol: "AMZN", name: "Amazon.com Inc.", type: "Equity", region: "United States" },
      { symbol: "TSLA", name: "Tesla Inc.", type: "Equity", region: "United States" },
      { symbol: "NVDA", name: "NVIDIA Corporation", type: "Equity", region: "United States" },
      { symbol: "META", name: "Meta Platforms Inc.", type: "Equity", region: "United States" },
      { symbol: "NFLX", name: "Netflix Inc.", type: "Equity", region: "United States" },
      { symbol: "AMD", name: "Advanced Micro Devices", type: "Equity", region: "United States" },
      { symbol: "COIN", name: "Coinbase Global Inc.", type: "Equity", region: "United States" },
    ];
    return POPULAR.filter(
      s =>
        s.symbol.includes(query.toUpperCase()) ||
        s.name.toLowerCase().includes(query.toLowerCase())
    );
  }
}

// ── Fetch historical OHLCV for charting ───────────────────────
async function getHistory(symbol, range = "1m") {
  // range: "1d" | "5d" | "1m" | "3m" | "1y"
  const rangeMap = {
    "1d": { function: "TIME_SERIES_INTRADAY", interval: "5min" },
    "5d": { function: "TIME_SERIES_INTRADAY", interval: "60min" },
    "1m": { function: "TIME_SERIES_DAILY", outputsize: "compact" },
    "3m": { function: "TIME_SERIES_DAILY", outputsize: "compact" },
    "1y": { function: "TIME_SERIES_WEEKLY" },
  };

  const config = rangeMap[range] || rangeMap["1m"];

  try {
    let url = `https://www.alphavantage.co/query?function=${config.function}&symbol=${symbol}&apikey=${AV_KEY}`;
    if (config.interval)    url += `&interval=${config.interval}`;
    if (config.outputsize)  url += `&outputsize=${config.outputsize}`;

    const { data } = await axios.get(url, { timeout: 8000 });

    // Extract the time series key (varies by function)
    const seriesKey = Object.keys(data).find(k => k.startsWith("Time Series"));
    if (!seriesKey) throw new Error("No series data");

    const series = data[seriesKey];
    const points = Object.entries(series)
      .slice(0, 90) // max 90 data points
      .map(([date, vals]) => ({
        date,
        open:   parseFloat(vals["1. open"]),
        high:   parseFloat(vals["2. high"]),
        low:    parseFloat(vals["3. low"]),
        close:  parseFloat(vals["4. close"]),
        volume: parseInt(vals["5. volume"]),
      }))
      .reverse();

    return points;
  } catch {
    // Return mock sinusoidal history
    const base = 150 + Math.random() * 100;
    return Array.from({ length: 30 }, (_, i) => ({
      date:   new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
      close:  parseFloat((base + Math.sin(i / 3) * 15 + Math.random() * 5).toFixed(2)),
      volume: Math.floor(5e6 + Math.random() * 2e6),
    }));
  }
}

module.exports = { getQuote, getBatchQuotes, searchSymbol, getHistory };