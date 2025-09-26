const express = require('express');
const cors = require('cors');
const path = require('path');
const { getEbayAppToken } = require('./ebayAuth');
const axios = require('axios');
// load .env from project root (one level up) so credentials stored at repository root are found
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

console.log('ENV load:', {
  EBAY_CLIENT_ID_present: !!process.env.EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET_present: !!process.env.EBAY_CLIENT_SECRET,
  PORT: process.env.PORT || null,
});

  // Normalize platform short labels to friendly names
  const PLATFORM_MAP = {
    '3ds': 'Nintendo 3DS',
    'nintendo 3ds': 'Nintendo 3DS',
    'ds': 'Nintendo DS',
    'dsi': 'Nintendo DSi',
    'wii': 'Nintendo Wii',
    'wii u': 'Nintendo Wii U',
    'switch': 'Nintendo Switch',
    'ps4': 'PlayStation 4',
    'ps5': 'PlayStation 5',
    'ps3': 'PlayStation 3',
    'xbox one': 'Xbox One',
    'xbox series x': 'Xbox Series X',
    'xbox 360': 'Xbox 360',
    'pc': 'PC',
    'mac': 'Mac'
  };

  function normalizePlatformLabel(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toLowerCase();
    // split on common separators and try to find a known token
    const parts = s.split(/\s*[-\/\\|,;:]\s*/).map(p => p.trim());
    for (const p of parts) {
      if (!p) continue;
      if (PLATFORM_MAP[p]) return PLATFORM_MAP[p];
      // try removing non-alphanum
      const clean = p.replace(/[^a-z0-9 ]/g, '').trim();
      if (PLATFORM_MAP[clean]) return PLATFORM_MAP[clean];
    }
    // fallback to capitalized words
    return parts[0].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Normalize queries for cache keys and matching (lowercase, remove punctuation, collapse separators)
  function normalizeQuery(s) {
    if (!s) return '';
    try {
      let t = String(s).trim().toLowerCase();
      // replace multiple whitespace and common separators with single space
      t = t.replace(/[\s\-_/\\]+/g, ' ');
      // remove extraneous punctuation except alphanumerics and spaces
      t = t.replace(/[^a-z0-9\s]/g, '');
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    } catch (e) { return String(s).trim().toLowerCase(); }
  }

  // Shared helper: score candidate labels against a raw query and return sorted suggestions
  function scoreCandidates(rawQ, candidates = [], opts = {}) {
    const out = [];
    if (!rawQ) return out;
    const qNorm = normalizeQuery(rawQ);
    const qtokens = qNorm.split(/\s+/).filter(Boolean);
    const GAME_CATEGORY_HINTS = opts.gameHints || ['video games','video games & consoles','gaming','games'];
    for (const c of (candidates || [])) {
      try {
        const labelRaw = (c && (c.label || c)) || '';
        if (!labelRaw) continue;
        const cleaned = (cleanListingTitleForName(labelRaw) || labelRaw).toLowerCase();
        const category = (c && c.category) ? String(c.category).toLowerCase() : '';
        // count token overlap
        const overlap = qtokens.reduce((s, t) => s + (cleaned.includes(t) ? 1 : 0), 0);
        const minRequired = qtokens.length >= 3 ? Math.ceil(qtokens.length / 3) : 1;
        if (overlap < minRequired) continue;
        let score = 0;
        if (cleaned.startsWith(qNorm)) score += 140;
        const idx = cleaned.indexOf(qNorm);
        if (idx >= 0) score += Math.max(0, 60 - idx);
        for (const t of qtokens) if (cleaned.includes(t)) score += 10;
        // small boost if category suggests games
        for (const h of GAME_CATEGORY_HINTS) if (category.includes(h)) { score += 30; break; }
        // shorter labels slightly preferred
        score += Math.max(0, 6 - Math.floor(cleaned.length / 36));
        out.push({ label: labelRaw, score, category: c && c.category ? c.category : null, raw: c });
      } catch (e) {}
    }
    out.sort((a,b) => b.score - a.score);
    const max = opts.max || 12;
    return out.slice(0, max).map(s => ({ label: s.label, source: (s.raw && s.raw.source) || 'server', category: s.category }));
  }

const app = express();
// expose custom tracing headers to the browser so client can read them
app.use(cors({ exposedHeaders: ['X-Server-Duration-ms', 'X-Request-Id'] }));
app.use(express.json());
const fs = require('fs');

// lightweight request tracing: attach a short request id and a trace helper
app.use((req, res, next) => {
  try {
    const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
    req.requestId = rid;
    res.setHeader('X-Request-Id', rid);
    // container for timing steps: {name, ts}
    res.locals._timingSteps = [{ name: 'start', ts: Date.now() }];
    // helper to record named step
    req.trace = (name) => {
      try { res.locals._timingSteps.push({ name: String(name || 'step'), ts: Date.now() }); } catch (e) {}
    };
  } catch (e) {}
  next();
});

// server timing middleware: attach X-Server-Duration-ms and emit request trace to server.log
app.use((req, res, next) => {
  const start = Date.now();
  const origJson = res.json.bind(res);
  res.json = function (body) {
    try {
      const ms = Date.now() - start;
      res.setHeader('X-Server-Duration-ms', String(ms));
      const rid = req.requestId || (res.getHeader && res.getHeader('X-Request-Id')) || null;
      if (rid) res.setHeader('X-Request-Id', rid);
      try {
        const steps = (res.locals && res.locals._timingSteps) || [];
        const normalized = steps.map(s => ({ name: s.name, ts: s.ts }));
        const deltas = [];
        for (let i = 1; i < normalized.length; i++) {
          deltas.push({ name: normalized[i].name, deltaMs: normalized[i].ts - normalized[i-1].ts });
        }
        const logLine = JSON.stringify({ time: new Date().toISOString(), rid, totalMs: ms, deltas, url: req.originalUrl, method: req.method });
        // only persist verbose traces when explicitly enabled via env
        try {
          if (process.env.ENABLE_TRACE_LOG === '1') {
            try { fs.appendFile(path.join(__dirname, 'server.log'), logLine + '\n', () => {}); } catch (e) {}
            try { console.debug('[trace]', logLine); } catch (e) {}
          }
        } catch (e) {}
      } catch (e) {}
    } catch (e) {}
    return origJson(body);
  };
  next();
});

// Use pluggable cache wrapper (Redis if REDIS_URL set, otherwise in-memory fallback)
const cache = require('./cache');
async function setCache(key, value, ttlMs = 30000) {
  const ttlSeconds = Math.ceil((ttlMs || 30000) / 1000);
  return cache.set(key, value, ttlSeconds);
}
async function getCache(key) {
  return cache.get(key);
}

// Seed suggestions on startup if cache empty
(async function seedSuggestions() {
  try {
    const existing = await getCache('dr_recent');
    if (!existing || !Array.isArray(existing) || existing.length === 0) {
      const seed = require('./suggestions_seed.json');
      if (Array.isArray(seed) && seed.length) {
        await setCache('dr_recent', seed, 1000 * 60 * 60 * 24 * 7);
        console.log('[seed] dr_recent seeded with', seed.length, 'items');
      }
    }
  } catch (e) { console.warn('[seed] failed', e && e.message); }
})();

// axios GET with simple retry + exponential backoff for transient failures
async function axiosGetWithRetry(url, opts = {}, attempts = 2, baseDelay = 200) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await axios.get(url, opts);
      return r;
    } catch (err) {
      lastErr = err;
      const status = err && err.response && err.response.status;
      // retry on network errors or 5xx
      if (status && status < 500) break;
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`[axiosRetry] attempt ${i + 1} failed, retrying in ${delay}ms`, (err && err.message) || status);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function cleanListingTitleForName(t) {
  if (!t) return '';
  // remove common marketing tokens and extra punctuation
  let s = String(t);
  s = s.replace(/\b(BRAND NEW|NEW SEALED|SEALED|BRAND-NEW|BRANDNEW|FACTORY SEALED|BOXED|WITH CASE|CASE|TESTED|WORKING|LIKE NEW|MINT|FREE SHIPPING|WATA|GRADED|9.8|10|1ST PRINT)\b/ig, '');
  s = s.replace(/\b(USA|NTSC|PAL|EU|UK|US)\b/ig, '');
  // remove platform tokens
  s = s.replace(/\b(NINTENDO SWITCH|NINTENDO|SWITCH|PS5|PS4|PLAYSTATION 5|PLAYSTATION 4|XBOX SERIES X|XBOX ONE|WII U|3DS|PC)\b/ig, '');
  // remove parenthetical/bracketed content
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, '');
  s = s.replace(/[^\w\s\-:]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // trim long suffixes and punctuation
  s = s.replace(/[-:]+$/g, '').trim();
  if (s.length > 100) s = s.substring(0, 100).trim();
  // remove trailing single letters or stray tokens like 'A' or 'B'
  s = s.replace(/\s+[A-Z]$/i, '').trim();
  // remove redundant word 'Game' at end
  s = s.replace(/\s+game$/i, '').trim();
  // Title case-ish: lowercase then uppercase first letters
  s = s.toLowerCase().split(' ').map(w => w.length ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ').trim();
  return s;
}

function detectPlatformFromListings(listings = [], preferredNames = []) {
  // Infer platform by majority vote across listing titles (more robust than first-match)
  if (!Array.isArray(listings)) return null;
  // ordered map of regex -> normalized platform label
  const platformPatterns = [
    // match handheld/legacy consoles first (more specific)
    { re: /\b(nintendo\s+3ds|3ds|nintendo\s+ds|ds)\b/i, label: '3DS' },
    { re: /\b(wii\s*u|wiiu)\b/i, label: 'Wii U' },
    { re: /\b(wii)\b/i, label: 'Wii' },
    // modern consoles
    { re: /\b(ps5|playstation\s*5|playstation5)\b/i, label: 'PS5' },
    { re: /\b(ps4|playstation\s*4|playstation4)\b/i, label: 'PS4' },
    { re: /\b(xbox\s*series\s*x|xbox\s*seriesx)\b/i, label: 'Xbox Series X' },
    { re: /\b(xbox\s*one)\b/i, label: 'Xbox One' },
    // Nintendo Switch: match explicit 'switch' or 'nintendo switch' but avoid bare 'nintendo'
    { re: /\b(nintendo\s+switch|switch)\b/i, label: 'Nintendo Switch' },
    { re: /\b(pc|steam)\b/i, label: 'PC' },
  ];

  const counts = Object.create(null);
  for (const p of platformPatterns) counts[p.label] = 0;

  for (const l of listings) {
    if (!l) continue;
    const t = ((l.title || '') + ' ' + ((l.subtitle || '') || '')).trim();
    // prefer the first matching token per listing (prevents double-counting)
    for (const p of platformPatterns) {
      if (p.re.test(t)) {
        // base weight
        let weight = 1;
        // boost weight if this listing's cleaned title matches one of the preferred names
        try {
          const cleaned = cleanListingTitleForName(l.title || '');
          for (const pn of (preferredNames || [])) {
            if (!pn) continue;
            if (cleaned && cleaned.toLowerCase().includes(String(pn).toLowerCase())) {
              weight += 5;
              break;
            }
          }
        } catch (e) {}
        counts[p.label] = (counts[p.label] || 0) + weight;
        break;
      }
    }
  }

  // pick label with highest count (must be >0)
  let best = null;
  let bestCount = 0;
  for (const k of Object.keys(counts)) {
    if (counts[k] > bestCount) { best = k; bestCount = counts[k]; }
  }
  return bestCount > 0 ? best : null;
}

function isGradedListing(l) {
  if (!l || !l.title) return false;
  const t = String(l.title).toLowerCase();
  // quick tokens that often indicate graded/collector/one-off listings
  const simpleTokens = ['wata','graded','graded by','perfect 10','1st print','first print','first edition','prototype','limited edition','one of','one-of-a-kind','factory sealed','wata graded'];
  for (const tok of simpleTokens) if (t.includes(tok)) return true;

  // common grader acronyms (PSA, BGS, CGC) possibly followed or preceded by a numeric grade
  // examples: "PSA 10", "BGS 9.8", "WATA 9.8", "CGC 9.6", "Graded PSA 10"
  const graderAcronyms = /\b(?:psa|bgs|cgc|wata)\b/i;
  if (graderAcronyms.test(l.title)) return true;

  // numeric grade patterns standalone (9.8, 9.9, 10) often indicate graded listings when nearby grader tokens
  const numericGrade = /\b(?:9\.8|9\.9|9\.5|10|9\.6|9\.4|9\.7)\b/;
  if (numericGrade.test(l.title) && graderAcronyms.test(l.title + ' ')) return true;

  // explicit patterns like "graded 9.8", "graded: 10", "psa10" or "bgs9.8"
  const explicitGradePattern = /(?:graded[:\s]*)(?:psa|bgs|cgc|wata)?\s*\d{1,2}(?:\.\d)?/i;
  if (explicitGradePattern.test(l.title)) return true;

  // detect compact inline forms like PSA10 or BGS98 (common sellers omit spacing)
  const compactGrade = /\b(?:psa|bgs|cgc|wata)\s*\d{1,2}(?:\.\d)?\b/i;
  if (compactGrade.test(l.title)) return true;

  // extremely high prices or extremely long titles are likely collector listings
  try {
    const p = Number(l.price || l.price && l.price.value || 0);
    if (p && p > 1000) return true;
  } catch (e) { /* ignore parse errors */ }
  if (String(l.title).length > 220) return true;

  return false;
}

function chooseBestGameName(listings = [], detailsExtract = {}) {
  // prefer explicit detailsExtract.gameName when present
  if (detailsExtract && detailsExtract.gameName) return detailsExtract.gameName;
  // scan listings for short, focused titles
  const candidates = [];
  for (const l of (listings || [])) {
    if (!l || !l.title) continue;
    const cleaned = cleanListingTitleForName(l.title);
    if (!cleaned) continue;
    // ignore ones that are just UPC-like or too generic
    if (cleaned.length < 3) continue;
    candidates.push(cleaned);
  }
  if (!candidates.length) return null;
  // choose the shortest non-trivial cleaned title (removes long marketing strings)
  candidates.sort((a,b) => a.length - b.length);
  return candidates[0];
}

function filterOutlierPrices(prices = []) {
  const nums = prices.map(p => Number(p)).filter(n => Number.isFinite(n));
  if (nums.length <= 3) return nums;
  nums.sort((a,b) => a-b);
  const q1 = nums[Math.floor((nums.length-1) * 0.25)];
  const q3 = nums[Math.floor((nums.length-1) * 0.75)];
  const iqr = q3 - q1;
  const min = q1 - 1.5 * iqr;
  const max = q3 + 1.5 * iqr;
  return nums.filter(n => n >= min && n <= max);
}

// Use eBay Finding API to retrieve completed items (legacy AppID required)
async function findCompletedItemsViaFindingAPI(query, appId, entriesPerPage = 25) {
  if (!appId) throw new Error('missing-finding-appid');
  const url = 'https://svcs.ebay.com/services/search/FindingService/v1';
  const params = {
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.13.0',
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': 'true',
    'keywords': query,
    'paginationInput.entriesPerPage': Math.min(entriesPerPage, 200),
  };
  const headers = {
    'X-EBAY-SOA-SECURITY-APPNAME': appId,
    'X-EBAY-SOA-OPERATION-NAME': 'findCompletedItems',
  };
  const r = await axiosGetWithRetry(url, { params, headers }, 3, 250);
  if (!r || !r.data) return [];
  try {
    // response wrapper is findCompletedItemsResponse (array)
    const resp = r.data.findCompletedItemsResponse && r.data.findCompletedItemsResponse[0];
    const searchResult = resp && resp.searchResult && resp.searchResult[0];
    const items = (searchResult && searchResult.item) || [];
    // map to our internal soldListings shape
    return items.map(it => {
      const title = it.title && it.title[0] || '';
      const sellingStatus = it.sellingStatus && it.sellingStatus[0] || {};
      const currentPriceObj = sellingStatus.currentPrice && sellingStatus.currentPrice[0] || {};
      const price = currentPriceObj.__value__ ? Number(currentPriceObj.__value__) : null;
      const galleryURL = it.galleryURL && it.galleryURL[0] || null;
      const itemId = it.itemId && it.itemId[0] || null;
      return {
        id: itemId,
        title,
        price,
        thumbnail: galleryURL || '/vite.svg',
        itemHref: it.viewItemURL && it.viewItemURL[0] || null,
      };
    });
  } catch (e) {
    console.warn('[findingAPI] parse failed', e && e.message);
    return [];
  }
}

// attempt to use configured port, otherwise try 5001 then increment until free
const DEFAULT_PORT = 5001;
let PORT = Number(process.env.PORT) || DEFAULT_PORT;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

// dev-only cache management endpoint (set ALLOW_CACHE_CLEAR=1 to enable in non-dev)
app.post('/api/cache/clear', async (req, res) => {
  const allow = process.env.NODE_ENV !== 'production' || process.env.ALLOW_CACHE_CLEAR === '1';
  if (!allow) return res.status(403).json({ error: 'forbidden' });
  const { key } = req.body || {};
  try {
    if (key) {
      const ok = await cache.del(key);
      return res.json({ cleared: !!ok, key });
    }
    const ok = await cache.clear();
    return res.json({ cleared: !!ok, flushed: true });
  } catch (e) {
    return res.status(500).json({ error: 'cache-clear-failed', message: e && e.message });
  }
});

// Example search endpoint stub — returns mock results
app.post('/api/search', async (req, res) => {
  try {
    const { query, opts } = req.body || {};
  console.log('[search] request received for query=', query, 'preferCompleted=', !!(req.body && req.body.preferCompleted));
  try { if (req && req.trace) req.trace('handler-start'); } catch (e) {}
    if (!query) return res.status(400).json({ error: 'missing-query' });

    // use top-level normalizeQuery

    // If no eBay credentials are configured, or token acquisition fails, fall back
    // to a lightweight mocked response so local development works offline.
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.warn('EBAY_CLIENT_ID/SECRET not set — returning mock search result');
      const mock = {
        query,
        title: query || 'Mock Item Title',
        categoryId: '139973',
        thumbnail: '/vite.svg',
        avgPrice: 42.5,
        minPrice: 10,
        maxPrice: 120,
        soldListings: [
          { id: 1, title: 'Mock sold 1', price: 40, url: '#' },
          { id: 2, title: 'Mock sold 2', price: 45, url: '#' },
        ],
      };
      console.log('[search] returning mock (no credentials) for query=', query);
      return res.json(mock);
    }

    try {
  const { force } = req.body || {};
  const normalized = normalizeQuery(query);
  const cacheKey = `search:${normalized}`;
      const cached = !force ? await getCache(cacheKey) : null;
      if (cached) {
        console.log('[search] cache hit for', query, 'cachedType=', typeof cached);
        console.log('[search] cached payload preview:', (typeof cached === 'object') ? JSON.stringify(Object.keys(cached).slice(0,5)) : String(cached));
        // If cache contains a plain boolean/string (from an earlier error), ignore it
        if (typeof cached !== 'object' || cached === null) {
          console.warn('[search] cached value is not an object, ignoring cache for', cacheKey);
        } else {
          // validate cached object has meaningful fields before returning
          const hasMeaningful = (
            (cached.avgPrice !== null && cached.avgPrice !== undefined) ||
            (Array.isArray(cached.soldListings) && cached.soldListings.length > 0) ||
            (cached.title && String(cached.title).length > 3)
          );
          if (!hasMeaningful) {
            console.warn('[search] cached object missing fields, ignoring cache for', cacheKey);
          } else {
            // mark cached so frontend can show a badge
            return res.json(Object.assign({}, cached, { cached: true }));
          }
        }
      }

  try { if (req && req.trace) req.trace('token-start'); } catch (e) {}
  const token = await getEbayAppToken();
  try { if (req && req.trace) req.trace('token-end'); } catch (e) {}
  console.log('[search] acquired token, calling APIs');
      const preferCompleted = !!req.body.preferCompleted;
  // allow using the existing OAuth client id as the legacy Finding API AppID
  const findingAppId = process.env.EBAY_FINDING_APP_ID || process.env.EBAY_CLIENT_ID || null;

      // If requested (or if FINDING AppID is available) try Finding API completed items first
      let completedListings = [];
      if (preferCompleted || findingAppId) {
        try {
          try { if (req && req.trace) req.trace('finding-start'); } catch (e) {}
          completedListings = await findCompletedItemsViaFindingAPI(query, findingAppId);
          try { if (req && req.trace) req.trace('finding-end'); } catch (e) {}
          if (completedListings && completedListings.length) console.log('[search] using completed items from Finding API for', query);
        } catch (e) {
          console.warn('[search] Finding API failed or unavailable', e && e.message);
          completedListings = [];
        }
      }

      // call eBay Browse API to search item summaries using axios with retry (fallback and listing source)
      // build an enhanced eBay query: if the user entered a UPC/ISBN, search by that directly;
      // otherwise prefer the normalized phrase and append platform hints if present.
      function isLikelyUpc(s) {
        if (!s) return false;
        const d = String(s).replace(/[^0-9]/g, '');
        return [8,12,13].includes(d.length);
      }

      function tokenize(s) {
        if (!s) return [];
        return String(s)
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(Boolean)
          .filter(t => t.length > 1);
      }

      // lightweight server-side cleaning to strip marketing noise and bracketed text
      function cleanQuery(s) {
        if (!s) return '';
        let out = String(s);
        out = out.replace(/\[[^\]]*\]/g, ' ').replace(/\([^\)]*\)/g, ' ');
        out = out.replace(/\b(new video game|video game|standard edition|deluxe edition|collector(?:'s)? edition|preorder|sealed|cover art only)\b/ig, ' ');
        out = out.replace(/[^a-z0-9\s]/ig, ' ');
        out = out.replace(/\s+/g, ' ').trim();
        return out;
      }

  const rawNorm = normalized || String(query).trim();
  const cleaned = cleanQuery(rawNorm) || rawNorm;
  // normalizedQuery used by downstream ranking/labeling — prefer cleaned form
  const normalizedQuery = cleaned || rawNorm;
  const queryIsUpc = isLikelyUpc(query) || isLikelyUpc(normalizedQuery);
      let ebayQ = '';
      if (queryIsUpc) {
        // search by UPC value directly
        ebayQ = encodeURIComponent(String(query).replace(/[^0-9]/g, ''));
      } else {
        // prefer a cleaned, looser query for browse to avoid exact-title-only matches
        // if the cleaned query is short (<=4 words) we include an exact-phrase boost;
        // otherwise prefer the loose form which returns broader results.
        const wordCount = (cleaned || '').split(/\s+/).filter(Boolean).length || 0;
        const loose = encodeURIComponent(cleaned);
        // Only include an exact-phrase boost for short queries when the client
        // explicitly indicates the search originated from an eBay suggestion
        // (opts.source === 'ebay'). For manual typed searches, prefer the looser
        // cleaned form which returns broader results and avoids overly strict
        // exact-title-only matches.
        const sourceHint = (opts && opts.source) ? String(opts.source).toLowerCase() : '';
        const usePhrase = (wordCount > 0 && wordCount <= 4 && sourceHint === 'ebay');
        if (usePhrase) {
          const phrase = encodeURIComponent(`"${cleaned}"`);
          ebayQ = `${phrase}%20${loose}`;
        } else {
          ebayQ = `${loose}`;
        }
        // if client provided a category hint, append it to bias results
        if (opts && opts.category) {
          ebayQ = `${ebayQ}%20${encodeURIComponent(String(opts.category))}`;
        }
      }
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${ebayQ}&limit=30`;
  try { if (req && req.trace) req.trace('browse-start'); } catch (e) {}
  console.log('[search] calling eBay Browse API', url);
  const r = await axiosGetWithRetry(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  try { if (req && req.trace) req.trace('browse-end'); } catch (e) {}
      if (!r || (r.status && r.status >= 400)) {
        console.warn('eBay search failed', r && r.status, r && r.data);
        return res.status(502).json({ error: 'ebay-search-failed' });
      }
      const data = r.data;
      const browseItems = (data.itemSummaries || []).map(it => ({
        id: it.itemId,
        title: it.title,
        price: (it.price && it.price.value) || null,
        currency: (it.price && it.price.currency) || 'USD',
        thumbnail: it.image && it.image.imageUrl || '/vite.svg',
        itemHref: it.itemWebUrl,
        condition: it.condition || null,
      }));
      // helper: fetch full item details for a Browse item id and return parsed JSON
      async function fetchItemDetails(itemId, token) {
        if (!itemId || !token) return null;
        try {
          const cacheKey = `item_details:${itemId}`;
          // try cache first
          const cached = await getCache(cacheKey).catch(() => null);
          if (cached) return cached;
          const url = `https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(itemId)}`;
          const dr = await axiosGetWithRetry(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, 2, 200).catch(() => null);
          const data = dr && dr.data ? dr.data : null;
          if (data) {
            // cache briefly to avoid repeated detail calls — do not await cache write
            try { setCache(cacheKey, data, 1000 * 60 * 5).catch(() => {}); } catch (e) {}
          }
          return data;
        } catch (e) { return null; }
      }

      function extractAllFromDetails(details) {
        if (!details) return {};
        const out = { upc: null, gameName: null, platform: null, releaseYear: null };
        const tryDigits = (v) => {
          if (!v) return null;
          const s = String(v).replace(/[^0-9]/g, '');
          if ([8,12,13].includes(s.length)) return s;
          return null;
        };
        try {
          // top-level gtin
          if (details.gtin) {
            const g = tryDigits(details.gtin);
            if (g) out.upc = g;
          }
        } catch (e) {}
        try {
          // localizedAspects
          if (details.localizedAspects && Array.isArray(details.localizedAspects)) {
            for (const la of details.localizedAspects) {
              try {
                const name = (la && la.name) ? String(la.name).toLowerCase() : null;
                const value = (la && la.value) ? la.value : null;
                if (name && (name.includes('upc') || name.includes('gtin') || name.includes('barcode'))) {
                  const d = tryDigits(value);
                  if (d) out.upc = d;
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
        try {
          // product.aspects
          if (details.product && details.product.aspects) {
            for (const k of Object.keys(details.product.aspects)) {
              try {
                const vals = details.product.aspects[k];
                if (!out.gameName && k.toLowerCase().includes('game')) out.gameName = Array.isArray(vals) ? String(vals[0]) : String(vals);
                if (!out.platform && (k.toLowerCase().includes('platform') || k.toLowerCase().includes('system'))) out.platform = Array.isArray(vals) ? String(vals[0]) : String(vals);
                if (!out.releaseYear && k.toLowerCase().includes('year')) {
                  const y = Array.isArray(vals) ? String(vals[0]) : String(vals);
                  const m = y && y.match(/(?:19|20)\d{2}/);
                  if (m) out.releaseYear = m[0];
                }
                // UPC-like keys
                if (!out.upc && (k.toLowerCase().includes('upc') || k.toLowerCase().includes('gtin') || k.toLowerCase().includes('ean'))) {
                  const v = Array.isArray(vals) ? vals[0] : vals;
                  const d = tryDigits(v);
                  if (d) out.upc = d;
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
        try {
          // aspects
          if (details.aspects && typeof details.aspects === 'object') {
            for (const k of Object.keys(details.aspects)) {
              try {
                const vals = details.aspects[k];
                if (!out.gameName && k.toLowerCase().includes('game name')) out.gameName = Array.isArray(vals) ? String(vals[0]) : String(vals);
                if (!out.platform && (k.toLowerCase().includes('platform') || k.toLowerCase().includes('system'))) out.platform = Array.isArray(vals) ? String(vals[0]) : String(vals);
                if (!out.releaseYear && k.toLowerCase().includes('release')) {
                  const y = Array.isArray(vals) ? String(vals[0]) : String(vals);
                  const m = y && y.match(/(?:19|20)\d{2}/);
                  if (m) out.releaseYear = m[0];
                }
                if (!out.upc) {
                  if (Array.isArray(vals)) for (const v of vals) { const d = tryDigits(v); if (d) out.upc = d; }
                  else { const d = tryDigits(vals); if (d) out.upc = d; }
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
        try {
          // itemSpecifics array fallback
          if (details.itemSpecifics && Array.isArray(details.itemSpecifics)) {
            for (const s of details.itemSpecifics) {
              try {
                const n = (s.name || '').toLowerCase();
                const v = (s.value && s.value[0]) ? s.value[0] : (s.value || null);
                if (!v) continue;
                if (!out.gameName && n.includes('game')) out.gameName = String(v);
                if (!out.platform && (n.includes('platform') || n.includes('system'))) out.platform = String(v);
                if (!out.releaseYear) {
                  const m = String(v).match(/(?:19|20)\d{2}/);
                  if (m) out.releaseYear = m[0];
                }
                if (!out.upc) {
                  const d = tryDigits(v);
                  if (d) out.upc = d;
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
        // Additional heuristics: scan common top-level text fields for a 4-digit year
        try {
          const findYearInString = (s) => {
            if (!s) return null;
            try {
              const m = String(s).match(/(?:19|20)\d{2}/g);
              if (!m || !m.length) return null;
              // pick the first plausible year within a sensible range
              for (const cand of m) {
                const y = Number(cand);
                if (y >= 1970 && y <= (new Date().getFullYear() + 1)) return String(y);
              }
              return String(m[0]);
            } catch (e) { return null; }
          };
          // check title/subtitle/description
          if (!out.releaseYear) out.releaseYear = findYearInString(details.title) || null;
          if (!out.releaseYear) out.releaseYear = findYearInString(details.subtitle) || null;
          if (!out.releaseYear) out.releaseYear = findYearInString(details.description) || null;
          // product-level fields
          if (details.product) {
            if (!out.releaseYear) out.releaseYear = findYearInString(details.product.title) || null;
            if (!out.releaseYear) out.releaseYear = findYearInString(details.product.description) || null;
            // also check product.aspects values more exhaustively
            try {
              if (details.product.aspects) {
                for (const k of Object.keys(details.product.aspects || {})) {
                  if (out.releaseYear) break;
                  const vals = details.product.aspects[k];
                  if (Array.isArray(vals)) {
                    for (const v of vals) {
                      const y = findYearInString(v);
                      if (y) { out.releaseYear = y; break; }
                    }
                  } else {
                    const y = findYearInString(vals);
                    if (y) out.releaseYear = y;
                  }
                }
              }
            } catch (e) {}
          }
          // a final deep scan: stringify details and look for the first plausible year
          if (!out.releaseYear) {
            try {
              const s = JSON.stringify(details);
              out.releaseYear = findYearInString(s) || null;
            } catch (e) {}
          }
        } catch (e) {}
        return out;
      }

      // Enrich top browse items with item details (upc, aspects) — parallelized with limited concurrency
      try {
        const enrichCount = Math.min(12, browseItems.length);
        const concurrency = 4;
        if (enrichCount > 0 && token) {
    const queue = [];
          for (let i = 0; i < enrichCount; i++) {
            const it = browseItems[i];
            if (!it) continue;
            // skip if we already have a UPC and basic aspects
            if (it.upc) continue;
            queue.push(async () => {
              try {
                const details = await fetchItemDetails(it.id, token);
                if (!details) return;
                const all = extractAllFromDetails(details);
                if (all.upc) it.upc = all.upc;
                if (all.gameName && !it.cleanedTitle) it.cleanedTitle = all.gameName;
                if (all.platform && !it.platform) it.platform = normalizePlatformLabel(all.platform) || all.platform;
                if (all.releaseYear && !it.releaseYear) it.releaseYear = all.releaseYear;
                it._details = details;
              } catch (e) {}
            });
          }
          // run queue with limited concurrency
          try { if (req && req.trace) req.trace('enrich-queue-start'); } catch (e) {}
          const runners = new Array(concurrency).fill(null).map(async () => {
            while (queue.length) {
              const fn = queue.shift();
              if (!fn) break;
              await fn();
            }
          });
          await Promise.all(runners);
          try { if (req && req.trace) req.trace('enrich-queue-end'); } catch (e) {}
        }
      } catch (e) { /* ignore enrichment errors */ }

  // choose price source: prefer completedListings (Finding API) if present; otherwise use browseItems
  const priceSource = (completedListings && completedListings.length) ? completedListings : browseItems;
  // keep raw copy for transparency (may be refreshed after fetching details)
  let soldListingsRaw = priceSource.slice();

      // Re-rank browseItems by simple token overlap with the user's query to boost relevance
  try {
    const qTokens = tokenize(normalizedQuery || query);
    if (qTokens.length && Array.isArray(browseItems) && browseItems.length) {
      for (const it of browseItems) {
        const title = (it.title || '') + ' ' + (it.subtitle || '');
        const tTokens = tokenize(title);
        let overlap = 0;
        for (const qt of qTokens) if (tTokens.includes(qt)) overlap += 1;
        // score is fraction of query tokens matched (0..1) with small boost for exact title inclusion
        const frac = overlap / Math.max(qTokens.length, 1);
        const exactBoost = String(it.title || '').toLowerCase().includes((normalizedQuery || '').toLowerCase()) ? 0.12 : 0;
        it.matchScore = Math.min(1, frac + exactBoost);
      }
      // If client indicated the suggestion came from eBay, try to promote an exact cleaned title match
      try {
        if (opts && opts.source && String(opts.source).toLowerCase() === 'ebay') {
          const desired = cleanListingTitleForName(normalizedQuery) || normalizedQuery;
          if (desired) {
            for (let i = 0; i < browseItems.length; i++) {
              const it = browseItems[i];
              const cleaned = cleanListingTitleForName(it.title || '');
              if (cleaned && cleaned.toLowerCase() === desired.toLowerCase()) {
                // move to front
                browseItems.splice(i, 1);
                browseItems.unshift(it);
                break;
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
      // sort in-place by descending matchScore, then fallback to price presence
      browseItems.sort((a,b) => (b.matchScore || 0) - (a.matchScore || 0));
    }
  } catch (e) {
    console.warn('[search] re-rank failed', e && e.message);
  }
  // filter graded/collector listings from the price aggregation and returned soldListings
  const nonGraded = soldListingsRaw.filter((it) => !isGradedListing(it));
  console.log('[search] priceSource length=', priceSource && priceSource.length, 'nonGraded=', nonGraded.length);

  // Aim to base prices on up to `desiredCount` non-graded sold listings. If we don't
  // have enough non-graded results, attempt to fetch additional completed items
  // (when using Finding API) or rely on a larger Browse API result set.
  const desiredCount = 20;
  let filteredSource = nonGraded.slice(0, desiredCount);
  if (filteredSource.length < desiredCount && findingAppId && (!completedListings || completedListings.length)) {
    try {
      // try to fetch more completed items (up to 100) and recompute
      const moreCompleted = await findCompletedItemsViaFindingAPI(query, findingAppId, 100).catch(() => []);
      if (moreCompleted && moreCompleted.length) {
        const combined = (completedListings || []).concat(moreCompleted);
        const combinedRaw = combined.slice();
        const combinedNonGraded = combinedRaw.filter((it) => !isGradedListing(it));
        filteredSource = combinedNonGraded.slice(0, desiredCount);
      }
    } catch (e) {
      console.warn('[search] extra Finding API fetch failed', e && e.message);
    }
  }

      // Attempt to fetch detailed item info for the top Browse item to surface item specifics
      let topItemDetails = null;
      try {
        if (browseItems.length && token) {
          const topId = browseItems[0].id;
              if (topId) {
                  try { if (req && req.trace) req.trace('top-detail-start'); } catch (e) {}
                  const detailUrl = `https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(topId)}`;
                  const dr = await axiosGetWithRetry(detailUrl, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, 2, 200).catch(() => null);
                  topItemDetails = dr && dr.data ? dr.data : null;
                  try { if (req && req.trace) req.trace('top-detail-end'); } catch (e) {}
                }
        }
      } catch (e) {
        console.warn('[search] failed to fetch item details for top item', e && e.message);
      }

      // helper to extract aspects/itemSpecifics from details
      function extractFromDetails(details) {
        if (!details) return {};
        const out = {};
        // aspects object (key -> [values])
        if (details.aspects && typeof details.aspects === 'object') {
          const aspects = details.aspects;
          const find = (candidates) => {
            for (const c of candidates) {
              for (const k of Object.keys(aspects)) {
                if (k.toLowerCase().includes(c.toLowerCase())) {
                  const v = aspects[k];
                  if (Array.isArray(v) && v.length) return String(v[0]);
                  if (v) return String(v);
                }
              }
            }
            return null;
          };
          out.gameName = find(['game name','title','name']);
          out.platform = find(['platform','system']);
          out.releaseYear = find(['release year','year','release']);
        }
        // itemSpecifics array [{name, value}] fallback
        if ((!out.gameName || !out.platform || !out.releaseYear) && details.itemSpecifics && Array.isArray(details.itemSpecifics)) {
          const specs = details.itemSpecifics;
          for (const s of specs) {
            const n = (s.name || '').toLowerCase();
            const v = (s.value && s.value[0]) ? s.value[0] : (s.value || null);
            if (!v) continue;
            if (!out.gameName && n.includes('game')) out.gameName = String(v);
            if (!out.platform && (n.includes('platform') || n.includes('system'))) out.platform = String(v);
            if (!out.releaseYear) {
              const m = String(v).match(/(?:19|20)\d{2}/);
              if (m) out.releaseYear = m[0];
            }
          }
        }
        // product aspects fallback
        if ((!out.gameName || !out.platform || !out.releaseYear) && details.product && details.product.aspects) {
          const aspects = details.product.aspects;
          const findKey = (keys) => {
            for (const k of Object.keys(aspects)) {
              for (const test of keys) if (k.toLowerCase().includes(test)) return aspects[k] && aspects[k][0];
            }
            return null;
          };
          if (!out.platform) out.platform = findKey(['platform','system']);
          if (!out.gameName) out.gameName = findKey(['game','title','name']);
          if (!out.releaseYear) {
            const y = findKey(['year','release']);
            if (y && String(y).match(/(?:19|20)\d{2}/)) out.releaseYear = String(y).match(/(?:19|20)\d{2}/)[0];
          }
        }
        return out;
      }

  // merge extractFromDetails (aspects) with unified extractor for broader coverage
  let detailsExtract = Object.assign({}, extractFromDetails(topItemDetails), extractAllFromDetails(topItemDetails || {}));
  // sanitize releaseYear: only accept a plausible 4-digit year within a sensible range
  try {
    const validateYear = (v) => {
      if (!v) return null;
      try {
        const s = String(v).match(/(?:19|20)\d{2}/);
        if (!s) return null;
        const y = Number(s[0]);
        const now = new Date().getFullYear();
        if (y >= 1970 && y <= now + 1) return String(y);
        return null;
      } catch (e) { return null; }
    };
    if (detailsExtract && detailsExtract.releaseYear) {
      const sanitized = validateYear(detailsExtract.releaseYear);
      detailsExtract.releaseYear = sanitized;
    }
  } catch (e) {}

      // helper: attempt to pull a numeric UPC-like identifier from details
      function extractUpcFromDetails(details) {
        if (!details) return null;
        const tryDigits = (v) => {
          if (!v) return null;
          const s = String(v).replace(/[^0-9]/g, '');
          if ([8,12,13].includes(s.length)) return s;
          return null;
        };
        // top-level gtin (e.g., 'gtin': '4902370534597')
        try {
          if (details.gtin) {
            const g = tryDigits(details.gtin);
            if (g) return g;
          }
        } catch (e) {}
        // localizedAspects often contains UPC under a named aspect
        try {
          if (details.localizedAspects && Array.isArray(details.localizedAspects)) {
            for (const la of details.localizedAspects) {
              try {
                const name = (la && la.name) ? String(la.name).toLowerCase() : null;
                const value = (la && la.value) ? la.value : null;
                if (name && (name.includes('upc') || name.includes('gtin') || name.includes('barcode'))) {
                  const d = tryDigits(value);
                  if (d) return d;
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
        // check product aspects
        try {
          if (details.product && details.product.aspects) {
            for (const k of Object.keys(details.product.aspects)) {
              const vals = details.product.aspects[k];
              if (Array.isArray(vals)) for (const v of vals) { const d = tryDigits(v); if (d) return d; }
              else { const d = tryDigits(vals); if (d) return d; }
            }
          }
        } catch (e) {}
        // check aspects/top-level
        try {
          if (details.aspects && typeof details.aspects === 'object') {
            for (const k of Object.keys(details.aspects)) {
              const v = details.aspects[k];
              if (Array.isArray(v)) for (const vv of v) { const d = tryDigits(vv); if (d) return d; }
              else { const d = tryDigits(v); if (d) return d; }
            }
          }
        } catch (e) {}
        // itemSpecifics fallback
        try {
          if (details.itemSpecifics && Array.isArray(details.itemSpecifics)) {
            for (const s of details.itemSpecifics) {
              const v = (s.value && s.value[0]) ? s.value[0] : (s.value || null);
              const d = tryDigits(v);
              if (d) return d;
            }
          }
        } catch (e) {}
        return null;
      }

      // If many browse items lack UPCs, fetch item details for the top few to try to locate UPCs
      async function fetchUpcsForBrowseItems(items = [], token, limit = 6) {
        if (!items || !items.length || !token) return;
        // run up to `concurrency` detail fetches in parallel to avoid sequential waits
        const concurrency = 4;
        const queue = [];
        for (const it of items) {
          if (queue.length >= limit) break;
          if (!it || it.upc) continue;
          queue.push(async () => {
            try {
              const d = await fetchItemDetails(it.id, token);
              const upc = (d && extractAllFromDetails(d).upc) || null;
              if (upc) it.upc = upc;
            } catch (e) {
              // ignore individual failures
            }
          });
        }
        if (!queue.length) return;
        try { if (req && req.trace) req.trace('fetch-upc-start'); } catch (e) {}
        const runners = new Array(concurrency).fill(null).map(async () => {
          while (queue.length) {
            const fn = queue.shift();
            if (!fn) break;
            await fn();
          }
        });
        await Promise.all(runners);
        try { if (req && req.trace) req.trace('fetch-upc-end'); } catch (e) {}
      }

      // attempt to enrich browseItems with UPCs for the top results only when client requests it
      try {
        const doEnrichUpcs = !!(req.body && req.body.enrichUpcs);
        if (doEnrichUpcs) {
          try { if (req && req.trace) req.trace('fetch-upc-init'); } catch (e) {}
          await fetchUpcsForBrowseItems(browseItems, token, 6);
        }
      } catch (e) { /* ignore */ }
      // if priceSource used browseItems, refresh soldListingsRaw to reflect any enriched UPCs
      try { soldListingsRaw = priceSource.slice(); } catch (e) {}

  // basic aggregation for UI: avg/min/max based on chosen source
  const rawPrices = filteredSource.map(i => Number(i.price)).filter(p => !Number.isNaN(p));
  const prices = filterOutlierPrices(rawPrices);
  const avgPrice = prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length) : null;
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

      // round numeric results to 2 decimals and attach timestamp
      const round = (v) => {
        if (v === null || v === undefined) return null;
        const n = Number(v);
        if (Number.isNaN(n)) return null;
        return Number(n.toFixed(2));
      };
  // ensure we have a concise gameName
  const candidateGameName = chooseBestGameName(priceSource, detailsExtract);
  // prefer explicit extraction from top item details, otherwise majority-vote inference
  // pass preferred names so listings whose cleaned titles match the chosen game name are weighted
  const preferredNames = [];
  if (detailsExtract && detailsExtract.gameName) preferredNames.push(detailsExtract.gameName);
  if (candidateGameName) preferredNames.push(candidateGameName);
  try { if (normalizedQuery) preferredNames.push(normalizedQuery); } catch (e) {}
  const inferredPlatform = detailsExtract.platform || detectPlatformFromListings(priceSource, preferredNames) || null;

  // normalize platform label for client display
  const normalizedPlatform = normalizePlatformLabel(inferredPlatform) || inferredPlatform || null;

  // compute counts for transparency
  const rawCount = soldListingsRaw.length;
  const filteredCount = rawCount - filteredSource.length;
  const nGraded = soldListingsRaw.filter(isGradedListing).length;
  // price outliers removed from aggregation: difference between items used for listing display and items used for price stats
  const nPriceOutliers = Math.max(0, filteredSource.length - prices.length);
  const filteredBreakdown = { graded: nGraded, priceOutliers: nPriceOutliers };

  const out = {
    query,
    title: (browseItems.length ? browseItems[0].title : query),
        categoryId: (data.categoryId || null),
        thumbnail: (browseItems.length ? browseItems[0].thumbnail : '/vite.svg'),
        avgPrice: round(avgPrice),
        minPrice: round(minPrice),
        maxPrice: round(maxPrice),
        // include potential extracted specifics from the top item or inferred from listings
  gameName: detailsExtract.gameName || candidateGameName || null,
  platform: normalizedPlatform,
        releaseYear: detailsExtract.releaseYear || null,
  // expose filtered soldListings (hide graded/collector items) for frontend parsing
  soldListings: filteredSource,
  // explicit sample size used for price aggregation and graded omitted count for UI copy
  sampleSize: Array.isArray(filteredSource) ? filteredSource.length : 0,
  gradedOmitted: nGraded,
  // keep raw list for debugging if needed
  // include a small, slimmed sample of raw listings to reduce payload size; include full raw only when debugFull=true
  soldListingsRaw: ((req.body && req.body.debugFull) ? soldListingsRaw : (Array.isArray(soldListingsRaw) ? soldListingsRaw.slice(0,10).map(l => ({ id: l.id, title: l.title, price: l.price, thumbnail: l.thumbnail, itemHref: l.itemHref, upc: l.upc || null, platform: l.platform || null })) : [])),
  rawCount,
  filteredCount,
  filteredBreakdown,
        fetchedAt: new Date().toISOString(),
      };
  // cache for short TTL to speed up repeated scans; await to reduce race conditions
  // send response first (ensures client isn't blocked by cache writes)
  try {
    res.json(out);
  } catch (e) {
    try { return res.json(out); } catch (e2) { return; }
  }
  // fire-and-forget cache write (no tracing) to avoid blocking. Use the normalized cacheKey so
  // other endpoints (eg. /api/suggest) can lookup `search:{normalized}` consistently.
  try {
    setCache(cacheKey, out, 30000).catch((e) => { console.warn('[search] cache set failed', e && e.message); });
  } catch (e) {}
  // also append this query/title to `dr_recent` in the background so suggestions improve over time
  try {
    (async () => {
      try {
        const cur = (await getCache('dr_recent')) || [];
        const entry = { query: query, title: out.title || query };
        // dedupe by normalized query
        const qn = normalizeQuery(entry.query || entry.title || '');
        const merged = [];
        const seen = new Set();
        merged.push(entry);
        seen.add(qn);
        for (const e of cur) {
          const en = normalizeQuery((e && (e.query || e.title)) || '');
          if (!en || seen.has(en)) continue;
          seen.add(en);
          merged.push(e);
          if (merged.length >= 50) break;
        }
        await setCache('dr_recent', merged, 1000 * 60 * 60 * 24 * 7);
      } catch (e) {}
    })();
  } catch (e) {}
  return;
    } catch (e) {
      console.warn('eBay token/search failed, returning mock result', e && e.message);
      const mock = {
        query,
        title: query || 'Mock Item Title',
        upc: query,
        categoryId: '139973',
        thumbnail: '/vite.svg',
        avgPrice: 42.5,
        minPrice: 10,
        maxPrice: 120,
        soldListings: [
          { id: 1, title: 'Mock sold 1', price: 40, url: '#' },
          { id: 2, title: 'Mock sold 2', price: 45, url: '#' },
        ],
      };
      return res.json(mock);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'search-failed' });
  }
});

// lightweight suggestion endpoint: returns recent cached search titles or recent items matching q
app.get('/api/suggest', async (req, res) => {
  try {
    const rawQ = (req.query.q || '').toString().trim();
    const q = normalizeQuery(rawQ);
    if (!q) return res.json({ suggestions: [] });
    const out = [];
    // try to read recent explicit list from cache key 'dr_recent' (if written by frontend)
    try {
      const recent = await getCache('dr_recent');
      if (Array.isArray(recent)) {
        for (const r of recent) {
          const label = (r && (r.title || r.query)) || r || '';
          if (!label) continue;
          if (label.toLowerCase().includes(q)) out.push({ label, source: 'recent' });
          if (out.length >= 10) break;
        }
      }
    } catch (e) {
      // ignore
    }
    // also check cache keys for simple 'search:' entries (fallback to in-memory Map)
    try {
      // fallbackCache is not exported; use cache.get to attempt known keys pattern 'search:' by scanning fallback map keys
      // Since we don't have direct access to internal map here, attempt several common transformations
      const sampleKeys = [];
      // try a few candidate keys from hypothetical recent queries in localStorage style
      for (let i = 0; i < 10; i++) sampleKeys.push(`search:${q}`);
      // attempt to read 'search:{q}' directly
  const maybe = await getCache(`search:${q}`);
      if (maybe && maybe.title) out.push({ label: maybe.title, source: 'cache' });
    } catch (e) {}

    // dedupe and cut to max 5
    const seen = new Set();
    const final = [];
    for (const s of out) {
      const k = (s.label || '').trim();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      final.push({ label: k, source: s.source || 'server' });
      if (final.length >= 5) break;
    }
    return res.json({ suggestions: final });
  } catch (e) {
    console.warn('[suggest] failed', e && e.message);
    return res.json({ suggestions: [] });
  }
});

// removed debug route after unifying extraction

// Persist recent items sent from frontend (optional). Body should be an array of recent items or a single item.
app.post('/api/recent', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ ok: false, error: 'missing-payload' });
    // normalize to array of simple objects { query, title }
    const arr = Array.isArray(payload) ? payload : [payload];
    const normalized = arr.map(it => ({ query: it.query || it.title || '', title: it.title || it.query || '' })).filter(it => it.query);
    // merge with existing dr_recent (server-side) deduping by query, keeping newest first
    const existing = (await getCache('dr_recent')) || [];
    const merged = [];
    const seen = new Set();
    // store both raw title and normalized query for matching
    const normed = normalized.map(it => ({ query: it.query, title: it.title, qNorm: normalizeQuery(it.query) }));
    const existNormed = existing.map(it => ({ query: it.query, title: it.title, qNorm: normalizeQuery(it.query || it.title || '') }));
    for (const it of normed.concat(existNormed)) {
      if (!it || !it.qNorm) continue;
      if (seen.has(it.qNorm)) continue;
      seen.add(it.qNorm);
      merged.push({ query: it.query, title: it.title });
      if (merged.length >= 50) break;
    }
    await setCache('dr_recent', merged, 1000 * 60 * 60 * 24 * 7); // keep for 7 days
    return res.json({ ok: true, count: merged.length });
  } catch (e) {
    console.warn('[recent] save failed', e && e.message);
    return res.status(500).json({ ok: false, error: e && e.message });
  }
});

// Improve suggestion lookup by token overlap and simple prefix matching against server-side `dr_recent` list
app.get('/api/suggest-v2', async (req, res) => {
  try {
    const rawQ = (req.query.q || '').toString().trim();
    const q = normalizeQuery(rawQ);
    if (!q || q.length < 2) return res.json({ suggestions: [] });
    const recent = (await getCache('dr_recent')) || [];
    const candidates = recent.map(r => ({ label: (r && (r.title || r.query)) || '', category: null, source: 'recent' }));
    const scored = scoreCandidates(rawQ, candidates, { max: 8 });
    return res.json({ suggestions: scored });
  } catch (e) {
    return res.json({ suggestions: [] });
  }
});

// eBay Browse-backed suggestions: fetch item summaries and return cleaned, deduped titles
app.get('/api/ebay-suggest', async (req, res) => {
  try {
    const rawQ = (req.query.q || '').toString().trim();
    if (!rawQ || rawQ.length < 2) return res.json({ suggestions: [] });
    const qNorm = normalizeQuery(rawQ);
    const cacheKey = `ebay_suggest:${qNorm}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ suggestions: cached });

    // need an OAuth app token for Browse API
    let token = null;
    try { token = await getEbayAppToken(); } catch (e) { token = null; }
    if (!token) return res.json({ suggestions: [] });

    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
  // send the raw query string to eBay for best matching, but cache under normalized key
  const params = { q: rawQ, limit: 50 };
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': process.env.EBAY_MARKETPLACE_ID || 'EBAY_US'
    };
    try {
      const r = await axiosGetWithRetry(url, { params, headers }, 2, 200);
      const items = (r && r.data && r.data.itemSummaries) || [];
      const candidates = items.map(it => ({ label: (it.title || '').trim(), category: (it.categoryPath || (it.primaryCategory && it.primaryCategory.categoryName)) || null, source: 'ebay' }));
      const scored = scoreCandidates(rawQ, candidates, { max: 20 });
      try { await setCache(cacheKey, scored, 1000 * 60 * 1); } catch (e) {}
      return res.json({ suggestions: scored });
    } catch (e) {
      console.warn('[ebay-suggest] failed', e && e.message);
      return res.json({ suggestions: [] });
    }
  } catch (e) {
    return res.json({ suggestions: [] });
  }
});

// add lightweight logging middleware for search route bodies
app.use((req, res, next) => {
  if (req.path === '/api/search') {
    // body may not be populated yet for large payloads, but usually small
    console.log('[request] /api/search', req.method, req.path);
  }
  next();
});

// NOTE: server timing middleware is defined earlier to avoid double-wrapping `res.json`.
// The earlier middleware attaches `X-Server-Duration-ms`, `X-Request-Id`, and logs
// per-step timing to `server.log`. Keep that single implementation to ensure
// consistent timing and prevent duplicated/conflicting traces.

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
  server.on('error', (err) => {
    console.error('Failed to start server on port', port, err && err.code);
    if (err && err.code === 'EADDRINUSE') {
      const next = port + 1;
      console.warn(`Port ${port} in use — trying ${next}`);
      startServer(next);
    } else process.exit(1);
  });
}

startServer(PORT);
