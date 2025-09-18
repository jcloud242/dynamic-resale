const Redis = require('ioredis');
const url = process.env.REDIS_URL;

// Simple in-memory fallback cache
const fallbackCache = new Map();

let redis = null;
let usingRedis = false;

if (url) {
  try {
    redis = new Redis(url);
    usingRedis = true;
    redis.on('error', (err) => {
      console.warn('[cache] Redis error, falling back to in-memory:', err && err.message);
      usingRedis = false;
    });
    redis.on('connect', () => { usingRedis = true; console.log('[cache] connected to Redis'); });
  } catch (e) {
    console.warn('[cache] failed to initialize Redis client, using in-memory', e && e.message);
    redis = null;
    usingRedis = false;
  }
}

async function set(key, value, ttlSeconds = 30) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  if (usingRedis && redis) {
    try {
      if (ttlSeconds) await redis.set(key, payload, 'EX', ttlSeconds);
      else await redis.set(key, payload);
      return true;
    } catch (e) {
      console.warn('[cache] redis set failed, writing to fallback', e && e.message);
      usingRedis = false;
    }
  }
  // fallback
  try {
    fallbackCache.set(key, { value: payload, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
    return true;
  } catch (e) {
    return false;
  }
}

async function get(key) {
  if (usingRedis && redis) {
    try {
      const v = await redis.get(key);
      if (v === null) return null;
      try { return JSON.parse(v); } catch (_) { return v; }
    } catch (e) {
      console.warn('[cache] redis get failed, falling back', e && e.message);
      usingRedis = false;
    }
  }
  const entry = fallbackCache.get(key);
  if (!entry) return null;
  if (entry.expires && Date.now() > entry.expires) { fallbackCache.delete(key); return null; }
  try { return JSON.parse(entry.value); } catch (_) { return entry.value; }
}

function ready() {
  return usingRedis || true; // always ready because we have fallback
}

async function del(key) {
  if (usingRedis && redis) {
    try { await redis.del(key); return true; } catch (e) { console.warn('[cache] redis del failed', e && e.message); usingRedis = false; }
  }
  try { return fallbackCache.delete(key); } catch (e) { return false; }
}

async function clear() {
  if (usingRedis && redis) {
    try { await redis.flushdb(); return true; } catch (e) { console.warn('[cache] redis flush failed', e && e.message); usingRedis = false; }
  }
  try { fallbackCache.clear(); return true; } catch (e) { return false; }
}

module.exports = { set, get, ready, del, clear };

