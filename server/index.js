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

const app = express();
app.use(cors());
app.use(express.json());

// Use pluggable cache wrapper (Redis if REDIS_URL set, otherwise in-memory fallback)
const cache = require('./cache');
async function setCache(key, value, ttlMs = 30000) {
  const ttlSeconds = Math.ceil((ttlMs || 30000) / 1000);
  return cache.set(key, value, ttlSeconds);
}
async function getCache(key) {
  return cache.get(key);
}

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

function detectPlatformFromListings(listings = []) {
  if (!Array.isArray(listings)) return null;
  const tokens = ['Nintendo Switch','Switch','PS5','PS4','PlayStation 5','PlayStation 4','Xbox Series X','Xbox One','Wii U','3DS','PC'];
  for (const l of listings) {
    if (!l || !l.title) continue;
    const t = l.title;
    for (const token of tokens) {
      const re = new RegExp(`\\b${token.replace(/\s+/g,'\\s+')}\\b`, 'i');
      if (re.test(t)) {
        // normalize
        const s = token.toLowerCase();
        if (s.includes('playstation 5') || token === 'PS5') return 'PS5';
        if (s.includes('playstation 4') || token === 'PS4') return 'PS4';
        if (s.includes('nintendo switch') || token.toLowerCase().includes('switch')) return 'Nintendo Switch';
        if (s.includes('xbox series x')) return 'Xbox Series X';
        if (s.includes('xbox one')) return 'Xbox One';
        if (s.includes('wii u')) return 'Wii U';
        if (s.includes('3ds')) return '3DS';
        if (s.includes('pc')) return 'PC';
        return token;
      }
    }
  }
  return null;
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
    const { query } = req.body;
    console.log('[search] request received for query=', query, 'preferCompleted=', !!(req.body && req.body.preferCompleted));
    if (!query) return res.status(400).json({ error: 'missing-query' });

    // If no eBay credentials are configured, or token acquisition fails, fall back
    // to a lightweight mocked response so local development works offline.
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.warn('EBAY_CLIENT_ID/SECRET not set — returning mock search result');
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
      console.log('[search] returning mock (no credentials) for query=', query);
      return res.json(mock);
    }

    try {
      const { force } = req.body || {};
      const cacheKey = `search:${query}`;
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

  const token = await getEbayAppToken();
  console.log('[search] acquired token, calling APIs');
      const preferCompleted = !!req.body.preferCompleted;
  // allow using the existing OAuth client id as the legacy Finding API AppID
  const findingAppId = process.env.EBAY_FINDING_APP_ID || process.env.EBAY_CLIENT_ID || null;

      // If requested (or if FINDING AppID is available) try Finding API completed items first
      let completedListings = [];
      if (preferCompleted || findingAppId) {
        try {
          completedListings = await findCompletedItemsViaFindingAPI(query, findingAppId);
          if (completedListings && completedListings.length) console.log('[search] using completed items from Finding API for', query);
        } catch (e) {
          console.warn('[search] Finding API failed or unavailable', e && e.message);
          completedListings = [];
        }
      }

      // call eBay Browse API to search item summaries using axios with retry (fallback and listing source)
      const q = encodeURIComponent(query);
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&limit=30`;
      console.log('[search] calling eBay Browse API', url);
      const r = await axiosGetWithRetry(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
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
        upc: (it.legacyItemId && it.legacyItemId.legacyItemId) || null,
      }));

  // choose price source: prefer completedListings (Finding API) if present; otherwise use browseItems
  const priceSource = (completedListings && completedListings.length) ? completedListings : browseItems;
  // keep raw copy for transparency
  const soldListingsRaw = priceSource.slice();
  // filter graded/collector listings from the price aggregation and returned soldListings
  const nonGraded = soldListingsRaw.filter((it) => !isGradedListing(it));
  console.log('[search] priceSource length=', priceSource && priceSource.length, 'nonGraded=', nonGraded.length);

  // Aim to base prices on up to `desiredCount` non-graded sold listings. If we don't
  // have enough non-graded results, attempt to fetch additional completed items
  // (when using Finding API) or rely on a larger Browse API result set.
  const desiredCount = 10;
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
            const detailUrl = `https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(topId)}`;
            const dr = await axiosGetWithRetry(detailUrl, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, 2, 200).catch(() => null);
            topItemDetails = dr && dr.data ? dr.data : null;
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

      const detailsExtract = extractFromDetails(topItemDetails);

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
  // if platform not in detailsExtract, try to infer from soldListings
  const inferredPlatform = detailsExtract.platform || detectPlatformFromListings(priceSource) || null;

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
        upc: query,
        categoryId: (data.categoryId || null),
        thumbnail: (browseItems.length ? browseItems[0].thumbnail : '/vite.svg'),
        avgPrice: round(avgPrice),
        minPrice: round(minPrice),
        maxPrice: round(maxPrice),
        // include potential extracted specifics from the top item or inferred from listings
  gameName: detailsExtract.gameName || candidateGameName || null,
  platform: inferredPlatform,
        releaseYear: detailsExtract.releaseYear || null,
  // expose filtered soldListings (hide graded/collector items) for frontend parsing
  soldListings: filteredSource,
  // explicit sample size used for price aggregation and graded omitted count for UI copy
  sampleSize: Array.isArray(filteredSource) ? filteredSource.length : 0,
  gradedOmitted: nGraded,
  // keep raw list for debugging if needed
  soldListingsRaw: soldListingsRaw,
  rawCount,
  filteredCount,
  filteredBreakdown,
        fetchedAt: new Date().toISOString(),
      };
  // cache for short TTL to speed up repeated scans; await to reduce race conditions
  try { await setCache(`search:${query}`, out, 30000); } catch(e) { console.warn('[search] cache set failed', e && e.message); }
      return res.json(out);
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

// add lightweight logging middleware for search route bodies
app.use((req, res, next) => {
  if (req.path === '/api/search') {
    // body may not be populated yet for large payloads, but usually small
    console.log('[request] /api/search', req.method, req.path);
  }
  next();
});

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
