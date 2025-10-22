import { useEffect, useMemo, useState, Component } from "react";
import RechartsAnalytics from "@ui/charts/RechartsAnalytics.jsx";
import SearchHeader from "@features/search/SearchHeader.jsx";
import "./analytics.css";
import "@styles/page.css";
import ResultList from "@features/results/ResultList.jsx";
import { formatResultTitle } from "@lib/titleHelpers.js";
import MetricBox from "@components/MetricBox.jsx";
import { postSearch } from "@services/api.js";


// Client-side estimator (mirrors server heuristics when sold data isn't available)
function clientComputeEstimateFromActives(listings = [], opts = {}) {
  const prices = (listings || [])
    .map((l) => {
      try {
        return Number(
          l.avgPrice || l.price || (l.price && l.price.value) || null
        );
      } catch (e) {
        return null;
      }
    })
    .filter((n) => Number.isFinite(n));
  const sampleSize = prices.length;
  if (!sampleSize)
    return { sampleSize: 0, confidence: "low", scenarios: {}, base: null };

  // filter outliers (IQR)
  const nums = [...prices].sort((a, b) => a - b);
  const q1 = nums[Math.floor((nums.length - 1) * 0.25)];
  const q3 = nums[Math.floor((nums.length - 1) * 0.75)];
  const iqr = q3 - q1 || 0;
  const min = q1 - 1.5 * iqr;
  const max = q3 + 1.5 * iqr;
  const cleaned = nums.filter((x) => x >= min && x <= max);
  const avgActive = cleaned.length
    ? cleaned.reduce((a, b) => a + b, 0) / cleaned.length
    : null;
  const median = (() => {
    if (!cleaned.length) return null;
    const s = [...cleaned].sort((a, b) => a - b);
    const m = Math.floor((s.length - 1) / 2);
    return s.length % 2 ? s[m] : (s[m] + s[m + 1]) / 2;
  })();

  const defaults = {
    binFactor: 0.88,
    feeRate: 0.15,
    shippingEstimate: 3.5,
    refurbCost: 0,
  };
  const cfg = Object.assign({}, defaults, opts || {});

  const scenarios = {
    optimistic: { saleFactor: Math.min(1.0, cfg.binFactor + 0.07) },
    base: { saleFactor: cfg.binFactor },
    conservative: { saleFactor: Math.max(0.6, cfg.binFactor - 0.06) },
  };

  for (const k of Object.keys(scenarios)) {
    const s = scenarios[k];
    const expectedSale = avgActive ? avgActive * s.saleFactor : null;
    const proceedsBeforeShip = expectedSale
      ? expectedSale * (1 - cfg.feeRate)
      : null;
    const netExpected =
      proceedsBeforeShip !== null
        ? proceedsBeforeShip - cfg.shippingEstimate
        : null;
    s.expectedSale =
      expectedSale !== null ? Number(expectedSale.toFixed(2)) : null;
    s.netExpected =
      netExpected !== null ? Number(netExpected.toFixed(2)) : null;
    // suggested buy given a user target margin will be computed in UI using profitPct
  }

  let confidence = "low";
  try {
    const std = (() => {
      if (!cleaned.length) return 0;
      const m = avgActive;
      return Math.sqrt(
        cleaned.reduce((s, x) => s + Math.pow(x - m, 2), 0) / cleaned.length
      );
    })();
    if (sampleSize >= 12 && std / Math.max(0.0001, avgActive) < 0.25)
      confidence = "high";
    else if (sampleSize >= 6) confidence = "medium";
  } catch (e) {}

  return {
    sampleSize,
    cleanedCount: cleaned.length,
    avgActive: avgActive !== null ? Number(avgActive.toFixed(2)) : null,
    medianActive: median !== null ? Number(median.toFixed(2)) : null,
    confidence,
    scenarios,
    generatedAt: new Date().toISOString(),
  };
}

function buildAggregateSeries(recent) {
  // recent is an array of items; many may not have timeSeries. We'll build a simple
  // aggregated series by bucketing by day (or index) from available timeSeries.avg points.
  const all = [];
  for (const it of recent || []) {
    if (!it || !it.timeSeries || !Array.isArray(it.timeSeries.avg)) continue;
    for (const p of it.timeSeries.avg) {
      if (!p || typeof p.t === "undefined" || typeof p.v === "undefined")
        continue;
      all.push({ t: p.t, v: Number(p.v) });
    }
  }
  // group by day string
  const map = {};
  for (const p of all) {
    const d = new Date(p.t).toISOString().slice(0, 10);
    map[d] = map[d] || { sum: 0, count: 0 };
    map[d].sum += p.v;
    map[d].count += 1;
  }
  const keys = Object.keys(map).sort();
  const avg = keys.map((k) => ({
    t: k,
    v: Math.round((map[k].sum / map[k].count) * 100) / 100,
  }));
  return { avg, min: [], max: [] };
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Analytics render error", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="dr-analytics" style={{ padding: 20 }}>
          <h3>Analytics failed to load</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(
              this.state.error && this.state.error.message
                ? this.state.error.message
                : this.state.error
            )}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AnalyticsInner({ item, onBack }) {
  // Summary dashboard with search and item-level analytics below
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dr_recent") || "[]") || []; } catch { return []; }
  });
  const [lastAnalyticsItem, setLastAnalyticsItem] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dr_last_analytics_item') || 'null'); } catch { return null; }
  });
  // Keep recent and last item synced across tabs and page interactions
  useEffect(() => {
    function reloadRecent() {
      try { setRecent(JSON.parse(localStorage.getItem('dr_recent') || '[]') || []); } catch {}
    }
    function reloadLast() {
      try { setLastAnalyticsItem(JSON.parse(localStorage.getItem('dr_last_analytics_item') || 'null')); } catch {}
    }
    const onStorage = (e) => {
      if (!e) return;
      if (e.key === 'dr_recent') reloadRecent();
      if (e.key === 'dr_last_analytics_item') reloadLast();
    };
    function onRecentChanged() { reloadRecent(); }
    function onLastChanged() { reloadLast(); }
    window.addEventListener('storage', onStorage);
    window.addEventListener('dr_recent_changed', onRecentChanged);
    window.addEventListener('dr_last_analytics_item_changed', onLastChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('dr_recent_changed', onRecentChanged);
      window.removeEventListener('dr_last_analytics_item_changed', onLastChanged);
    };
  }, []);
  const [selectedItem, setSelectedItem] = useState(null);
  // slider controls target profit percentage (profit margin)
  const [profitPct, setProfitPct] = useState(30);
  const [buyPrice, setBuyPrice] = useState(() => {
    try {
      return Number(localStorage.getItem("dr_last_buy_price") || 0);
    } catch (e) {
      return 0;
    }
  });
  const [serverEstimate, setServerEstimate] = useState(null);
  const [estLoading, setEstLoading] = useState(false);
  const [estError, setEstError] = useState(null);
  const [loadingItem, setLoadingItem] = useState(false);

  // persist a recent entry and notify listeners (History/Home)
  function saveRecent(res) {
    if (!res) return;
    try {
      const key = (res && (res.query || res.upc || res.title)) || "";
      const entry = {
        query: res.query || res.upc || key,
        title: res.title || res.query || key,
        upc: res.upc || null,
        thumbnail: res.thumbnail || "/vite.svg",
        avgPrice: res.avgPrice ?? null,
        minPrice: res.minPrice ?? null,
        maxPrice: res.maxPrice ?? null,
        category: res.category || res.platform || null,
        platform: res.platform || null,
        releaseYear: res.releaseYear || null,
        fetchedAt: res.fetchedAt || new Date().toISOString(),
      };
      const r = JSON.parse(localStorage.getItem("dr_recent") || "[]");
      const idx = r.findIndex((it) => it && (it.query === key || it.upc === key || it.title === key));
      if (idx !== -1) {
        r.splice(idx, 1);
        r.unshift(entry);
      } else {
        r.unshift(entry);
      }
      localStorage.setItem("dr_recent", JSON.stringify(r.slice(0, 10)));
      try { window.dispatchEvent(new CustomEvent("dr_recent_changed")); } catch (e) {}
      // best-effort server persistence
      try {
        fetch("/api/recent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: entry.query, title: entry.title }) }).catch(() => {});
      } catch (e) {}
    } catch (e) {}
  }

  // mock a 1-year series (2024-01-01 .. 2024-12-31) using random-ish walk from an avg
  function makeYearSeries(base = 30) {
    const start = new Date("2024-01-01").getTime();
    const pts = 12; // monthly points
    const arr = [];
    let v = base;
    for (let i = 0; i < pts; i++) {
      v = Math.max(1, Math.round((v + (Math.random() - 0.45) * 6) * 100) / 100);
      arr.push({ t: start + i * 30 * 24 * 60 * 60 * 1000, v });
    }
    return {
      avg: arr,
      min: arr.map((p) => ({ t: p.t, v: Math.max(0, p.v - 8) })),
      max: arr.map((p) => ({ t: p.t, v: p.v + 8 })),
    };
  }

  // pick a default item (first recent) if no selected
  // Prefer any freshly fetched selection over a passed-in prop item to avoid stale slim entries from History
  const itemToShow = selectedItem || item || lastAnalyticsItem || recent[0] || null;
  // memoize generated series so it doesn't change on every render (prevents twitching)
  const series = useMemo(() => {
    return itemToShow
      ? itemToShow.timeSeries || makeYearSeries(itemToShow.avgPrice || 30)
      : makeYearSeries(30);
  }, [itemToShow && (itemToShow.id || itemToShow.title || itemToShow.query)]);

  // top5: score recent items by token overlap with the selected item title (if available)
  function tokenize(s) {
    if (!s) return [];
    return String(s)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  }
  function scoreItem(a, bTokens) {
    const aTokens = tokenize(a.title || a.query || "");
    let score = 0;
    for (const t of aTokens)
      if (bTokens.includes(t) && t.length > 2) score += 1;
    // reward same platform
    if (
      (a.platform || a.category || "") &&
      itemToShow &&
      (itemToShow.platform || itemToShow.category)
    ) {
      if (
        (a.platform || a.category || "").toLowerCase() ===
        (itemToShow.platform || itemToShow.category || "").toLowerCase()
      )
        score += 1;
    }
    return score;
  }

  // Prefer server-provided ranked candidates (top 5) for the currently selected item
  const topCandidates = useMemo(() => {
    if (itemToShow && Array.isArray(itemToShow.rankedCandidates) && itemToShow.rankedCandidates.length) {
      return itemToShow.rankedCandidates.slice(0,5).map(c => ({
        id: c.id,
        title: c.gameName || c.title,
        platform: c.platform || '',
        price: typeof c.price === 'number' ? c.price : null,
        itemHref: c.itemHref || null,
        thumbnail: c.thumbnail || null,
        score: typeof c.score === 'number' ? c.score : null,
      }));
    }
    // fallback to prior local top5 heuristic from recents
    let top5 = [];
    if (itemToShow && itemToShow.title) {
      const bTokens = tokenize(itemToShow.title || itemToShow.query || "");
      const scored = (recent || []).map((r) => ({ r, score: scoreItem(r, bTokens) }));
      scored.sort((x,y) => y.score - x.score || new Date(y.r.fetchedAt||0) - new Date(x.r.fetchedAt||0));
      top5 = scored.filter(s => s.score > 0).map(s => s.r).slice(0,5);
    }
    if (!top5 || !top5.length) top5 = (recent || []).slice(0,5);
    return top5.map((r) => {
      const fmt = formatResultTitle(r || {});
      return {
        id: null,
        title: fmt.displayTitle || r.title || r.query,
        platform: r.platform || r.category || '',
        price: r.avgPrice || r.maxPrice || r.minPrice || 0,
        itemHref: null,
        thumbnail: r.thumbnail || null,
        score: null,
      };
    });
  }, [itemToShow && (itemToShow.id || itemToShow.title || itemToShow.query), recent]);

  // If the current item lacks rankedCandidates, ask the server for a fresh search result
  // (will hit cache when available) to populate rankedCandidates for Analytics.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!itemToShow) return;
        const hasRanked = Array.isArray(itemToShow.rankedCandidates) && itemToShow.rankedCandidates.length > 0;
        const q = itemToShow.query || itemToShow.title || itemToShow.upc || '';
        if (!q) return;
        // Force a refresh when the current context came from History (prop item),
        // or when rankedCandidates are missing. This ensures we always hydrate a full result.
        const shouldForce = (!!item) || !hasRanked;
        if (!shouldForce) return;
        setLoadingItem(true);
        const res = await postSearch({ query: q, opts: { suppressCachedBadge: true } });
        if (cancelled || !res) return;
        setSelectedItem(res);
        try { localStorage.setItem('dr_last_analytics_item', JSON.stringify(res)); } catch (e) {}
        setLoadingItem(false);
      } catch (e) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [itemToShow && (itemToShow.query || itemToShow.title)]);

  // Additionally, explicitly react to changes of the History-provided item prop
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!item) return;
        const q = item.query || item.title || item.upc || '';
        if (!q) return;
        setLoadingItem(true);
        const res = await postSearch({ query: q, opts: { suppressCachedBadge: true } });
        if (cancelled || !res) return;
        setSelectedItem(res);
        try { localStorage.setItem('dr_last_analytics_item', JSON.stringify(res)); } catch (e) {}
        setLoadingItem(false);
      } catch (e) { setLoadingItem(false); }
    })();
    return () => { cancelled = true; };
  }, [item && (item.query || item.title || item.upc)]);

  // rolling average (simple mean over recent with avgPrice)
  const avgPrices = (recent || [])
    .map((r) => (r && typeof r.avgPrice === "number" ? r.avgPrice : null))
    .filter(Boolean);
  const rollingAvg = avgPrices.length
    ? Math.round(
        (avgPrices.reduce((a, b) => a + b, 0) / avgPrices.length) * 100
      ) / 100
    : null;

  // estimate days to sell: crude estimate using soldListings per month if available
  const soldPerMonth =
    itemToShow && Array.isArray(itemToShow.soldListings)
      ? Math.max(0.1, itemToShow.soldListings.length / 6)
      : 0.5; // placeholder
  const daysToSell = Math.round((1 / soldPerMonth) * 30);

  // buy vs sell calc (very rough): cost = price*(1 + fees) ; profitMargin target
  const estimator = clientComputeEstimateFromActives(recent, {});
  const baseScenario =
    estimator && estimator.scenarios ? estimator.scenarios.base : null;
  const optimistic =
    estimator && estimator.scenarios ? estimator.scenarios.optimistic : null;
  const conservative =
    estimator && estimator.scenarios ? estimator.scenarios.conservative : null;
  // category-based fee map (override per-category where known)
  const categoryFeeMap = {
    // example entries; extend as needed
    "video games": { feeRate: 0.1325, shippingEstimate: 6 },
    books: { feeRate: 0.12, shippingEstimate: 4 },
    electronics: { feeRate: 0.13, shippingEstimate: 8 },
    clothing: { feeRate: 0.12, shippingEstimate: 6 },
  };
  const defaultFeeRate = 0.13; // fallback fee rate
  const defaultShipping = 7; // fallback shipping cost estimate
  const categoryKey = (function() {
    try {
      const raw = itemToShow ? (itemToShow.category || itemToShow.platform || '') : '';
      return String(raw).toLowerCase();
    } catch (e) { return ''; }
  })();
  const categoryCfg = categoryFeeMap[categoryKey] || null;
  const feeRate =
    categoryCfg && typeof categoryCfg.feeRate === "number"
      ? categoryCfg.feeRate
      : itemToShow && typeof itemToShow.feeRate === "number"
      ? itemToShow.feeRate
      : serverEstimate && typeof serverEstimate.feeRate === "number"
      ? serverEstimate.feeRate
      : defaultFeeRate;
  const shippingEstimate =
    categoryCfg && typeof categoryCfg.shippingEstimate === "number"
      ? categoryCfg.shippingEstimate
      : itemToShow && typeof itemToShow.shippingEstimate === "number"
      ? itemToShow.shippingEstimate
      : serverEstimate && typeof serverEstimate.shippingEstimate === "number"
      ? serverEstimate.shippingEstimate
      : defaultShipping;
  // Determine the sell price and net expected (prefer server estimate if present)
  const sellPrice =
    serverEstimate &&
    serverEstimate.scenarios &&
    serverEstimate.scenarios.base &&
    typeof serverEstimate.scenarios.base.expectedSale === "number"
      ? serverEstimate.scenarios.base.expectedSale
      : baseScenario && baseScenario.expectedSale
      ? baseScenario.expectedSale
      : itemToShow && itemToShow.avgPrice
      ? itemToShow.avgPrice
      : null;
  const netAfterFees =
    typeof sellPrice === "number"
      ? Number((sellPrice * (1 - feeRate) - shippingEstimate).toFixed(2))
      : null;
  const feeAmount =
    typeof sellPrice === "number"
      ? Number((sellPrice * feeRate).toFixed(2))
      : null;

  // determine the net expected value (after fees & shipping) to base suggested buy calculations on
  const netFromEstimator =
    serverEstimate &&
    serverEstimate.scenarios &&
    serverEstimate.scenarios.base &&
    typeof serverEstimate.scenarios.base.netExpected === "number"
      ? serverEstimate.scenarios.base.netExpected
      : baseScenario && baseScenario.netExpected
      ? baseScenario.netExpected
      : null;
  const netForSuggested =
    netFromEstimator !== null ? netFromEstimator : netAfterFees;

  // Interpret profitPct as the target net profit margin relative to the sale price (net / salePrice)
  // Interpret profitPct as the target net profit margin relative to total revenue (sale + shippingPaid)
  const targetMargin = Math.max(0, profitPct) / 100;
  // For now assume buyer-paid shipping equals our shipping estimate (1:1). We'll make this explicit later.
  const shippingPaid = shippingEstimate;

  // suggested buy given market sellPrice and targetMargin using revenue-based math
  // totalRevenue = sale + shippingPaid
  // fees = feeRate * totalRevenue
  // netBeforeBuy = totalRevenue - fees - shippingCost
  // buy = netBeforeBuy - targetMargin * totalRevenue
  const suggestedBuy =
    typeof sellPrice === "number"
      ? (function () {
          const totalRevenue = sellPrice + shippingPaid;
          const val =
            totalRevenue * (1 - feeRate - targetMargin) - shippingEstimate;
          if (!Number.isFinite(val)) return null;
          return Number(val.toFixed(2));
        })()
      : null;

  // helper: compute sale needed for a given buy and margin (revenue-based)
  function saleNeededForBuy(buy, margin) {
    if (buy === null || !Number.isFinite(buy)) return null;
    const denom = 1 - feeRate - margin;
    if (!(denom > 0)) return null;
    const totalRevenueNeeded = (buy + shippingEstimate) / denom;
    const saleNeeded = totalRevenueNeeded - shippingPaid;
    return Number(saleNeeded.toFixed(2));
  }

  // Determine which buy price to use for profit displays: item.bought (authoritative) > entered buyPrice if >0 > null
  const authoritativeBuy =
    itemToShow && typeof itemToShow.bought === "number"
      ? itemToShow.bought
      : buyPrice && Number(buyPrice) > 0
      ? Number(buyPrice)
      : null;

  // compute required sale price to reach targetMargin given a buy price (revenue-based)
  // totalRevenueNeeded * ((1 - feeRate) - targetMargin) = buy + shippingCost
  // totalRevenueNeeded = (buy + shippingCost) / denom
  // saleNeeded = totalRevenueNeeded - shippingPaid
  const requiredSalePrice =
    authoritativeBuy !== null
      ? (function () {
          const denom = 1 - feeRate - targetMargin;
          if (!(denom > 0)) return null; // impossible to reach such a high margin with these fees
          const totalRevenueNeeded =
            (authoritativeBuy + shippingEstimate) / denom;
          const saleNeeded = totalRevenueNeeded - shippingPaid;
          return Number(saleNeeded.toFixed(2));
        })()
      : null;

  // displayedSalePrice: show market sellPrice (if available). We'll also render requiredSalePrice separately so the user sees both.
  const marketSell = typeof sellPrice === "number" ? Number(sellPrice) : null;
  // Primary sale price to show: if we have a buy price, the required sale to meet the target may be more informative.
  // If requiredSalePrice is present and greater than market, show requiredSalePrice; otherwise show marketSell if available.
  const displayedSalePrice = (function () {
    if (authoritativeBuy !== null && requiredSalePrice !== null) {
      // If market covers required, prefer marketSell (you can sell at market and meet margin). Otherwise show required sale.
      if (marketSell !== null && marketSell >= requiredSalePrice)
        return marketSell;
      return requiredSalePrice;
    }
    // no authoritative buy: prefer the sale price needed for the suggested buy (so slider moves the sale price),
    // otherwise fall back to market sell or null.
    if (suggestedBuy !== null) {
      const saleNeeded = saleNeededForBuy(suggestedBuy, targetMargin);
      if (saleNeeded !== null) return saleNeeded;
    }
    if (marketSell !== null) return marketSell;
    return requiredSalePrice;
  })();

  // profit when bought and sold at displayedSalePrice (revenue-based)
  const profitWhenBought =
    authoritativeBuy !== null && displayedSalePrice !== null
      ? (function () {
          const totalRevenue = displayedSalePrice + shippingPaid;
          const fees = totalRevenue * feeRate;
          const net = totalRevenue - fees - shippingEstimate; // net before subtracting buy
          const profit = net - authoritativeBuy;
          return Number(profit.toFixed(2));
        })()
      : null;

  // If there's no authoritative buy, compute profit based on suggestedBuy (hypothetical)
  const profitWhenSuggested =
    suggestedBuy !== null && displayedSalePrice !== null
      ? (function () {
          const totalRevenue = displayedSalePrice + shippingPaid;
          const fees = totalRevenue * feeRate;
          const net = totalRevenue - fees - shippingEstimate;
          const profit = net - suggestedBuy;
          return Number(profit.toFixed(2));
        })()
      : null;

  // clamp negatives to zero for display per request
  const displayProfitWhenBought =
    profitWhenBought !== null ? Math.max(0, profitWhenBought) : null;
  const displayProfitWhenSuggested =
    profitWhenSuggested !== null ? Math.max(0, profitWhenSuggested) : null;

  // profit percent (relative to total revenue = sale + shippingPaid) for display
  const profitPctWhenBought =
    displayProfitWhenBought !== null && displayedSalePrice !== null
      ? Number(
          (
            (displayProfitWhenBought / (displayedSalePrice + shippingPaid)) *
            100
          ).toFixed(2)
        )
      : null;
  const profitPctWhenSuggested =
    displayProfitWhenSuggested !== null && displayedSalePrice !== null
      ? Number(
          (
            (displayProfitWhenSuggested / (displayedSalePrice + shippingPaid)) *
            100
          ).toFixed(2)
        )
      : null;

  // markup vs average (how far above/below market sell is compared to rolling average)
  const markupAmount =
    displayedSalePrice !== null && rollingAvg !== null
      ? Number((displayedSalePrice - rollingAvg).toFixed(2))
      : null;
  const markupPct =
    displayedSalePrice !== null && rollingAvg !== null && rollingAvg !== 0
      ? Number(((markupAmount / rollingAvg) * 100).toFixed(2))
      : null;

  // Info popup
  const [showInfo, setShowInfo] = useState(false);

  // compute profit given a buy price and a target sale price (helper)
  function computeProfitForSale(buy, salePriceVal) {
    if (buy === null || salePriceVal === null) return null;
    const net = salePriceVal * (1 - feeRate) - shippingEstimate;
    const profit = net - Number(buy || 0);
    return { profit: Number(profit.toFixed(2)), net: Number(net.toFixed(2)) };
  }

  // cache key helpers
  function cacheKeyForQuery(q) {
    return `est:${q}`;
  }

  async function fetchServerEstimate(q, force = false) {
    if (!q) return null;
    const key = cacheKeyForQuery(q);
    try {
      if (!force) {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.ts && Date.now() - parsed.ts < 1000 * 60 * 5) {
            // 5m cache
            // only update state if the cached value differs to avoid re-render loops
            try {
              const same =
                serverEstimate &&
                JSON.stringify(serverEstimate) === JSON.stringify(parsed.val);
              if (!same) setServerEstimate(parsed.val);
            } catch (e) {
              setServerEstimate(parsed.val);
            }
            return parsed.val;
          }
        }
      }
    } catch (e) {}
    setEstLoading(true);
    setEstError(null);
    try {
      const resp = await fetch("/api/estimate/from-actives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, buyPrice: Number(buyPrice || 0) }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        setEstError(`estimate-failed: ${resp.status} ${text}`);
        setEstLoading(false);
        return null;
      }
      const json = await resp.json();
      setServerEstimate(json);
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({ ts: Date.now(), val: json })
        );
      } catch (e) {}
      setEstLoading(false);
      return json;
    } catch (e) {
      setEstError(e && e.message ? e.message : String(e));
      setEstLoading(false);
      return null;
    }
  }

  // fetch estimate when the selected item's query/title (a stable string) changes
  const itemQuery =
    itemToShow && (itemToShow.title || itemToShow.query)
      ? String(itemToShow.title || itemToShow.query)
      : "";
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const q = itemQuery;
        if (!q) return;
        // don't fetch if we already have a serverEstimate for this exact query
        try {
          if (serverEstimate && serverEstimate.query === q) return;
        } catch (e) {}
        if (!mounted) return;
        await fetchServerEstimate(q);
      } catch (e) {}
    })();
    return () => {
      mounted = false;
    };
  }, [itemQuery]);

  // prepare Y axis ticks for the chart based on series
  const allVals = []
    .concat(
      series.avg.map((p) => p.v),
      series.min.map((p) => p.v),
      series.max.map((p) => p.v)
    )
    .filter((v) => v !== null && v !== undefined);
  const maxV = allVals.length ? Math.max(...allVals) : 0;
  const minV = allVals.length ? Math.min(...allVals) : 0;
  const yTicks = 3;
  const yVals = [];
  for (let i = 0; i <= yTicks; i++) {
    yVals.push(Math.round((minV + (i / yTicks) * (maxV - minV)) * 100) / 100);
  }

  return (
  <main className="dr-page dr-analytics">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
      </div>
      <div className="dr-searchbar-wrapper">
        <SearchHeader
          onSearch={async (payload) => {
            try {
              // normalize payload to a query string and opts
              let q = payload;
              let opts = { suppressCachedBadge: true };
              if (typeof payload === 'object' && payload !== null) {
                q = payload.query || payload.label || '';
                opts = Object.assign({}, opts, {
                  category: payload.category,
                  source: payload.source,
                  originalInput: payload.originalInput || (payload.query || payload.label || ''),
                });
              }
              if (!q) return;
              const res = await postSearch({ query: q, opts });
              setSelectedItem(res);
              try { localStorage.setItem('dr_last_analytics_item', JSON.stringify(res)); window.dispatchEvent(new CustomEvent('dr_last_analytics_item_changed')); } catch (e) {}
              try { saveRecent(res); } catch (e) {}
            } catch (e) {
              // ignore errors in Analytics search to keep page resilient
              console.warn('Analytics search failed', e && e.message);
            }
          }}
          onDetected={async (det) => {
            try {
              if (!det || det.type !== 'barcode') return;
              const q = det.value;
              if (!q) return;
              const res = await postSearch({ query: q, opts: { suppressCachedBadge: true, enrichUpcs: true, isBarcode: true, originalInput: q } });
              setSelectedItem(res);
              try { localStorage.setItem('dr_last_analytics_item', JSON.stringify(res)); window.dispatchEvent(new CustomEvent('dr_last_analytics_item_changed')); } catch (e) {}
              try { saveRecent(res); } catch (e) {}
            } catch (e) {
              console.warn('Analytics barcode search failed', e && e.message);
            }
          }}
          showScans={true}
        />
      </div>
      <div className="dr-main-card">
        <img
          className="dr-thumb-large"
          src={
            itemToShow && itemToShow.thumbnail
              ? itemToShow.thumbnail
              : "/vite.svg"
          }
          alt="thumb"
        />
        <div style={{ flex: 1 }}>
          <h3 className="dr-analytics-title" style={{ margin: 0 }}>
            {(() => {
              if (!itemToShow) return "Item analytics";
              try {
                const t = formatResultTitle(itemToShow || {});
                return t && t.displayTitle ? t.displayTitle : (itemToShow.title || itemToShow.query || "Item analytics");
              } catch (e) {
                return itemToShow.title || itemToShow.query || "Item analytics";
              }
            })()}
          </h3>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              marginTop: 12,
            }}
          >
            <div className="dr-chart-svg" style={{ height: 260 }}>
              <div className="dr-chart-card" style={{ height: 260 }}>
                <RechartsAnalytics
                  series={series}
                  width={680}
                  height={260}
                  accent={"var(--accent)"}
                  primary={"var(--primary)"}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dr-sep" />

      <div className="dr-analytics-grid">
        <div>
          <div className="dr-table">
            {!loadingItem && topCandidates.map((r, i) => (
              <div key={i} className="dr-table-row">
                <div className="left">
                  <a
                    className="title"
                    href={r.itemHref || '#'}
                    onClick={(e) => {
                      if (!r.itemHref) {
                        // No outbound link available; keep selection unchanged.
                        e.preventDefault();
                        return;
                      }
                    }}
                    target={r.itemHref ? '_blank' : undefined}
                    rel={r.itemHref ? 'noopener noreferrer' : undefined}
                  >
                    {r.title}
                  </a>
                  <div className="tags">
                    {r.platform ? (
                      <span className="chip">{String(r.platform).toUpperCase()}</span>
                    ) : null}
                    {/* Hide raw numeric score by default; keep as title tooltip for potential debug */}
                  </div>
                </div>
                <div className="right">
                  <div className="dr-price">{typeof r.price === 'number' ? `$${Number(r.price).toFixed(2)}` : '—'}</div>
                  <div className="date" />
                </div>
              </div>
            ))}
            {loadingItem ? (
              <div className="dr-table-row" aria-hidden>
                <div className="left">
                  <div className="title" style={{ height: 18, maxWidth: '60%', background: 'rgba(0,0,0,0.08)', borderRadius: 4 }} />
                  <div className="tags" style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                    <span className="chip" style={{ width: 64, height: 16, background: 'rgba(0,0,0,0.06)' }} />
                    <span className="chip" style={{ width: 40, height: 16, background: 'rgba(0,0,0,0.06)' }} />
                  </div>
                </div>
                <div className="right">
                  <div className="dr-price" style={{ width: 64, height: 18, background: 'rgba(0,0,0,0.08)', borderRadius: 4 }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="dr-right-panel">
          <div className="dr-kpi-grid">
            <MetricBox
              label="Rolling average"
              value={rollingAvg ? `$${rollingAvg}` : "—"}
              sub={rollingAvg ? "Last 3 months" : ""}
            />
            <MetricBox
              label="Days to sell (est)"
              value={daysToSell ? `${daysToSell} days` : "—"}
              sub={"Estimate from trend"}
            />
            <div style={{ position: "relative" }}>
              <MetricBox
                label={"Sell"}
                value={
                  displayedSalePrice !== null
                    ? `$${displayedSalePrice.toFixed(2)}`
                    : "—"
                }
                sub={
                  <>
                    Profit:{" "}
                    {authoritativeBuy !== null
                      ? displayProfitWhenBought !== null
                        ? `$${displayProfitWhenBought.toFixed(
                            2
                          )} (${profitPctWhenBought}% )`
                        : "—"
                      : displayProfitWhenSuggested !== null
                      ? `$${displayProfitWhenSuggested.toFixed(
                          2
                        )} (${profitPctWhenSuggested}% )`
                      : "—"}
                    {requiredSalePrice !== null && authoritativeBuy !== null ? (
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        Required sale for {profitPct}% margin: $
                        {requiredSalePrice.toFixed(2)}
                      </div>
                    ) : null}
                  </>
                }
              />
              <button
                title="Fees & assumptions"
                onClick={() => setShowInfo((s) => !s)}
                style={{
                  position: "absolute",
                  right: 6,
                  top: 6,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v.01" />
                  <path d="M11 12h1v5h1" />
                </svg>
              </button>
              {showInfo ? (
                <div
                  style={{
                    position: "absolute",
                    right: 6,
                    top: 36,
                    zIndex: 60,
                    minWidth: 220,
                    padding: 10,
                    background: "var(--card-bg)",
                    boxShadow: "0 12px 36px rgba(0,0,0,0.18)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--fg)",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Fees & assumptions
                  </div>
                  <div style={{ marginBottom: 6 }}>Fee rate: {Math.round(feeRate * 10000) / 100}%</div>
                  <div style={{ marginBottom: 6 }}>
                    Shipping (paid/cost): ${shippingPaid}/${shippingEstimate}
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    List price: {" "}
                    {(function () {
                      // Prefer requiredSalePrice when authoritative buy is present, otherwise fall back to suggestedBuy-derived sale needed.
                      if (requiredSalePrice !== null && authoritativeBuy !== null) return `$${requiredSalePrice.toFixed(2)}`;
                      if (suggestedBuy !== null) {
                        const s = saleNeededForBuy(suggestedBuy, targetMargin);
                        return s !== null ? `$${s.toFixed(2)}` : '—';
                      }
                      // finally, fall back to market if nothing else
                      if (marketSell !== null) return `$${marketSell.toFixed(2)}`;
                      return '—';
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
            <MetricBox
              label="Suggested buy price"
              value={
                suggestedBuy !== null ? `$${suggestedBuy.toFixed(2)}` : "—"
              }
              sub={
                typeof sellPrice === "number"
                  ? "Based on market sell price"
                  : netForSuggested !== null
                  ? "Based on active listings"
                  : ""
              }
            />
          </div>

          <div className="dr-slider" style={{ marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <label style={{ fontSize: 12, color: "var(--muted)" }}>
                Profit margin: {profitPct}%
              </label>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={profitPct}
              onChange={(e) => {
                setProfitPct(Number(e.target.value));
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Analytics(props) {
  return (
    <ErrorBoundary>
      <AnalyticsInner {...props} />
    </ErrorBoundary>
  );
}
