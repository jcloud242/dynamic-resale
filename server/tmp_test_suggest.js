const titles = [
  'Super Mario Maker',
  'Super Mario Maker 2',
  'Super Mario Maker 2 Nintendo Switch',
  'Super Mario Maker 2 Switch',
  'Super Mario Maker Wii U',
  'Super Mario Maker 3DS',
  'Super Mario Odyssey',
  'Super Mario Bros. Deluxe',
  'Super Mario Maker cartridge only',
  'Super Mario Maker 2 cartridge only',
  'Mario Kart 8 Deluxe',
  'Super Mario 64',
  'Super Mario Maker 2 2ds',
  'Super Mario Maker 2 nintendo switch',
  'Super Mario Maker 2 switch',
];

function cleanListingTitleForName(t) {
  if (!t) return '';
  let s = String(t);
  s = s.replace(/\b(BRAND NEW|NEW SEALED|SEALED|BRAND-NEW|BRANDNEW|FACTORY SEALED|BOXED|WITH CASE|CASE|TESTED|WORKING|LIKE NEW|MINT|FREE SHIPPING|WATA|GRADED|9.8|10|1ST PRINT)\b/ig, '');
  s = s.replace(/\b(USA|NTSC|PAL|EU|UK|US)\b/ig, '');
  s = s.replace(/\b(NINTENDO SWITCH|NINTENDO|SWITCH|PS5|PS4|PLAYSTATION 5|PLAYSTATION 4|XBOX SERIES X|XBOX ONE|WII U|3DS|PC)\b/ig, '');
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, '');
  s = s.replace(/[^\w\s\-:]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[-:]+$/g, '').trim();
  if (s.length > 100) s = s.substring(0, 100).trim();
  s = s.replace(/\s+[A-Z]$/i, '').trim();
  s = s.replace(/\s+game$/i, '').trim();
  s = s.toLowerCase().split(' ').map(w => w.length ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ').trim();
  return s;
}

function normalizeQuery(s) {
  if (!s) return '';
  try {
    let t = String(s).trim().toLowerCase();
    t = t.replace(/[\s\-_/\\]+/g, ' ');
    t = t.replace(/[^a-z0-9\s]/g, '');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  } catch (e) { return String(s).trim().toLowerCase(); }
}

function scoreTitles(qRaw) {
  const q = normalizeQuery(qRaw);
  const qtokens = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const tRaw of titles) {
    const cleaned = cleanListingTitleForName(tRaw) || tRaw;
    const llo = cleaned.toLowerCase();
    const overlap = qtokens.reduce((s, token) => s + (llo.includes(token) ? 1 : 0), 0);
    const minRequired = qtokens.length >= 3 ? Math.ceil(qtokens.length / 3) : 1;
    if (overlap < minRequired) continue;
    let score = 0;
    if (llo.startsWith(q)) score += 120;
    const idx = llo.indexOf(q);
    if (idx >= 0) score += Math.max(0, 50 - idx);
    for (const t of qtokens) if (llo.includes(t)) score += 10;
    score += Math.max(0, 6 - Math.floor(llo.length / 36));
    scored.push({ label: tRaw, score });
  }
  scored.sort((a,b) => b.score - a.score);
  return scored.map(s => s.label);
}

console.log('Query: Super Mario Maker');
console.log(scoreTitles('Super Mario Maker'));
console.log('\nQuery: Super Mario Maker 2');
console.log(scoreTitles('Super Mario Maker 2'));
console.log('\nQuery: Mario');
console.log(scoreTitles('Mario'));
