const express = require("express");
const router  = express.Router();
const axios   = require("axios");

const NEWS_API_KEY = process.env.NEWS_API_KEY;  // add to .env

// ── GET /api/news ─────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { limit = 20, tag } = req.query;

  try {
    // Option A: use a real crypto news API (cryptonews-api.com, newsapi.org, etc.)
    // const url = `https://cryptonews-api.com/api/v1/category?section=general&items=${limit}&token=${NEWS_API_KEY}`;
    // const { data } = await axios.get(url);
    // return res.json({ articles: data.data });

    // Option B: use NewsAPI.org filtered to crypto
    const url = `https://newsapi.org/v2/everything?q=cryptocurrency+bitcoin+ethereum&sortBy=publishedAt&pageSize=${limit}&apiKey=${NEWS_API_KEY}`;
    const { data } = await axios.get(url);

    const articles = data.articles.map((a, i) => ({
      id:        i + 1,
      title:     a.title,
      source:    a.source.name,
      time:      timeAgo(a.publishedAt),
      url:       a.url,
      tag:       detectTag(a.title),
      sentiment: detectSentiment(a.title),
    }));

    res.json({ articles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function detectTag(title = "") {
  const t = title.toLowerCase();
  if (t.includes("bitcoin") || t.includes("btc")) return "BTC";
  if (t.includes("ethereum") || t.includes("eth")) return "ETH";
  if (t.includes("solana") || t.includes("sol"))  return "SOL";
  if (t.includes("bnb") || t.includes("binance")) return "BNB";
  if (t.includes("xrp") || t.includes("ripple"))  return "XRP";
  if (t.includes("cardano") || t.includes("ada")) return "ADA";
  return "MARKET";
}

function detectSentiment(title = "") {
  const t = title.toLowerCase();
  const bullish = ["surge","rally","gains","rises","bullish","record","growth","up","high","bought","soars"];
  const bearish  = ["drop","fall","crash","bearish","decline","down","low","loss","plunge","sell"];
  if (bullish.some(w => t.includes(w))) return "bullish";
  if (bearish.some(w => t.includes(w)))  return "bearish";
  return "neutral";
}

module.exports = router;