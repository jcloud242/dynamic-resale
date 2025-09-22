export function cleanTitle(title) {
  if (!title) return '';
  let cleaned = String(title).replace(/[-:]+/g, ' ').replace(/\s+/g, ' ').trim();
  const plusIndex = cleaned.indexOf('+');
  if (plusIndex !== -1) cleaned = cleaned.substring(0, plusIndex).trim();
  return cleaned;
}

export function extractPlatform(listings = [], fallbackTitle='') {
  if (!Array.isArray(listings)) listings = [];
  // More exhaustive token list and normalization map
  const rawTokens = ['Nintendo Switch','Switch','NS','PS5','PlayStation 5','PS4','PlayStation 4','Xbox Series X','Series X','XSX','Xbox One','XOne','XBOX','PC','Wii U','3DS','Xbox Series S','Switch Lite'];
  const normalize = (t) => {
    const s = String(t).toLowerCase();
    if (s.includes('playstation 5') || s === 'ps5') return 'PS5';
    if (s.includes('playstation 4') || s === 'ps4') return 'PS4';
    if (s.includes('nintendo switch') || s === 'switch' || s === 'ns' || s.includes('switch lite')) return 'Nintendo Switch';
    if (s.includes('xbox series x') || s.includes('xsx') || s === 'xbox series s' || s.includes('series x')) return 'Xbox Series X';
    if (s.includes('xbox one') || s === 'xone' || s === 'xbox') return 'Xbox One';
    if (s.includes('wii u')) return 'Wii U';
    if (s.includes('3ds')) return '3DS';
    if (s.includes('pc')) return 'PC';
    return t;
  };

  // majority-vote across listing titles to avoid single accessory outliers
  const counts = Object.create(null);
  for (const token of rawTokens) counts[token] = 0;
  for (const l of listings) {
    if (!l || !l.title) continue;
    const t = l.title;
    for (const token of rawTokens) {
      const re = new RegExp(`\\b${token.replace(/\\s+/g,'\\\\s+')}\\b`, 'i');
      if (re.test(t)) { counts[token] = (counts[token] || 0) + 1; break; }
    }
  }
  // pick token with highest count
  let best = null; let bestCount = 0;
  for (const k of Object.keys(counts)) {
    if (counts[k] > bestCount) { best = k; bestCount = counts[k]; }
  }
  if (bestCount > 0) return normalize(best);

  // fallback: scan main title
  for (const token of rawTokens) {
    const re = new RegExp(`\\b${token.replace(/\s+/g,'\\s+')}\\b`, 'i');
    if (fallbackTitle && re.test(fallbackTitle)) return normalize(token);
  }
  return null;
}

export function extractYear(listings = [], title='') {
  const yearRe = /(?:19|20)\d{2}/g;
  if (title) {
    const m = title.match(yearRe);
    if (m && m.length) return m[0];
  }
  for (const l of (listings || [])) {
    if (!l || !l.title) continue;
    const m = l.title.match(yearRe);
    if (m && m.length) return m[0];
  }
  return null;
}

export function formatResultTitle(item = {}) {
  const { categoryId, gameName, 'Game Name': gameNameAlt, title, soldListings, upc } = item;
  const isGame = String(categoryId || '').trim() === '139973' || extractPlatform(soldListings || [], title) !== null;
  const listings = soldListings || [];
  let mainTitle = '';
  if (isGame) {
    // prefer explicit gameName, otherwise pick the shortest cleaned listing title (less marketing noise)
    const preferred = gameName || gameNameAlt || null;
    if (preferred) mainTitle = cleanTitle(preferred);
    else {
      // pick shortest cleaned listing title
      let best = null;
      for (const l of listings) {
        if (!l || !l.title) continue;
        const c = cleanTitle(l.title);
        if (!c) continue;
        if (!best || c.length < best.length) best = c;
      }
      mainTitle = best || cleanTitle(title || upc || '');
    }
    const platform = item.platform || extractPlatform(listings, title);
    const year = item.releaseYear || extractYear(listings, title);
    let meta = `UPC: ${upc || '-'}`;
    if (platform || year) {
      const parts = [];
      if (platform) parts.push(platform);
      if (year) parts.push(year);
      meta = `${parts.join(' - ')} (UPC: ${upc || '-'})`;
    }
    return { displayTitle: mainTitle, meta };
  }
  // default
  return { displayTitle: cleanTitle(title || item.query || upc || ''), meta: `UPC: ${upc || '-'}` };
}
