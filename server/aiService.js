const crypto = require('crypto');
const axios = require('axios');

// Optional official Google Generative AI client. If installed, prefer it because
// it handles model routing/auth nuances. We guard the require so servers without
// the package still work with REST fallback.
let GoogleGenerativeAIClient = null;
try {
  const pkg = require('@google/generative-ai');
  GoogleGenerativeAIClient = pkg && (pkg.GoogleGenerativeAI || pkg.GoogleGenerativeAIClient || pkg.default || null);
  if (GoogleGenerativeAIClient) console.log('[aiService] @google/generative-ai client detected and will be used when possible');
} catch (e) {
  // not installed — continue using REST fallback
  GoogleGenerativeAIClient = null;
  console.log('[aiService] @google/generative-ai not installed; using REST fallback');
}

// Simple in-memory cache with TTL
const cache = new Map();
function sha1(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex');
}

// Note: read API key at call time to reflect runtime env changes (useful during dev)
const GEMINI_MODELS = () => (process.env.GEMINI_MODELS || '').split(',').map(s => s.trim()).filter(Boolean) || [];
const GEMINI_MAX_WIDTH = () => Number(process.env.GEMINI_MAX_WIDTH || 1024);

// TTL for cached image analyses (ms)
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

// Helper: perform OCR using Google Cloud Vision REST API when an API key is provided.
// Uses VISION_API_KEY or GOOGLE_VISION_API_KEY env var. Returns detected text or null.
async function performOCRIfAvailable(base64Image) {
  try {
    // Prefer OCR.space when key present (free tier available). Falls back to
    // Google Vision if OCR.space key isn't provided.
    const ocrSpaceKey = process.env.OCR_SPACE_KEY || null;
    if (ocrSpaceKey && base64Image) {
      try {
        const FormData = require('form-data');
        const form = new FormData();
        // OCR.space expects a data URI when using base64Image
        const prefix = String(base64Image || '').startsWith('data:') ? '' : 'data:image/jpeg;base64,';
        form.append('apikey', ocrSpaceKey);
        form.append('base64Image', prefix + base64Image);
        form.append('language', 'eng');
        const headers = form.getHeaders();
        const r = await axios.post('https://api.ocr.space/parse/image', form, { headers, timeout: 10000 });
        const d = r && r.data ? r.data : null;
        if (d && d.ParsedResults && Array.isArray(d.ParsedResults) && d.ParsedResults.length) {
          const pr = d.ParsedResults[0];
          if (pr && pr.ParsedText) return String(pr.ParsedText).trim();
        }
      } catch (e) {
        console.warn('[aiService] OCR.space call failed', e && e.message);
        // fall through to Vision if available
      }
    }

    const key = process.env.VISION_API_KEY || process.env.GOOGLE_VISION_API_KEY || null;
    if (!key || !base64Image) return null;
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;
    const body = {
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['en'] }
        }
      ]
    };
    const r = await axios.post(url, body, { timeout: 8000 });
    const resp = r && r.data && r.data.responses && r.data.responses[0] ? r.data.responses[0] : null;
    if (!resp) return null;
    // prefer fullTextAnnotation if present
    if (resp.fullTextAnnotation && resp.fullTextAnnotation.text) return String(resp.fullTextAnnotation.text).trim();
    if (resp.textAnnotations && Array.isArray(resp.textAnnotations) && resp.textAnnotations.length) return String(resp.textAnnotations[0].description || '').trim();
    return null;
  } catch (e) {
    console.warn('[aiService] performOCR failed', e && e.message);
    return null;
  }
}

// Default preferred model names (in order)
const PREFERRED_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.0-flash'];

// Simple rate limiting to avoid 429s
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = Number(process.env.AI_MIN_REQUEST_INTERVAL_MS || 10000); // 10s default
// Track per-model rate-limit state when providers tell us to back off
const modelRateLimitedUntil = new Map(); // modelName -> timestamp (ms)

async function analyzeImage(imageInput) {
  if (!imageInput) throw new Error('missing image data');
  // Accept either a full data URL string or a raw base64 string or an object with imageBase64
  let imageDataUrl = null;
  let imageBase64 = null;
  let ocrTextFromClient = null;
  if (typeof imageInput === 'string') {
    if (imageInput.indexOf('base64,') !== -1) {
      imageDataUrl = imageInput;
      imageBase64 = imageInput.split('base64,')[1];
    } else {
      imageBase64 = imageInput;
      imageDataUrl = null;
    }
  } else if (imageInput && imageInput.imageBase64) {
    imageBase64 = imageInput.imageBase64;
    imageDataUrl = null;
    if (imageInput.ocrText) ocrTextFromClient = String(imageInput.ocrText).trim();
  }
  const cacheKeySeed = imageBase64 || imageDataUrl || String(imageInput);
  const key = sha1(cacheKeySeed);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiry > now) return cached.value;

  // If no API key present, return null so caller falls back to mocked response
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || null;
  if (!GEMINI_API_KEY) {
    console.warn('[aiService] GEMINI_API_KEY not set; falling back to mocked response');
    return null;
  }

  // Determine models to try: prefer PREFERRED_MODELS but intersect with what the key can access
  let models = [];
  // Try to list available models for the key
  let available = null;
  // If GEMINI_MODELS env is explicitly set, prefer that and skip listing to avoid unexpected preview models
  const envModelsExplicit = GEMINI_MODELS().filter(Boolean);
  if (envModelsExplicit && envModelsExplicit.length) {
    models = envModelsExplicit.map(m => 'models/' + String(m).replace(/^models\//, '').trim());
    console.log('[aiService] using explicit GEMINI_MODELS from env:', models);
  } else {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const listResp = await axios.get(listUrl, { timeout: 8000 });
    const md = listResp && listResp.data && listResp.data.models ? listResp.data.models : null;
    if (Array.isArray(md) && md.length) {
      // Keep the full model name including 'models/' prefix for the endpoint
      available = md.map(m => (m.name || m.model || m.id || '')).filter(Boolean);
      console.log('[aiService] available models for key:', available.slice(0, 20));
    }
  } catch (e) {
    // listing models failed; we'll fallback to preferred list
    console.warn('[aiService] failed to list models for key:', e && e.message);
  }
  }
  if (Array.isArray(available) && available.length) {
    // Filter out clearly unsuitable models (embeddings) but keep preview/pro when
    // no better option exists. We'll prefer image-capable models when an image
    // is present to avoid trying a long list of text-only models.
    // Remove embedding-only models and (by default) any preview/pro variants
    const nonEmbedding = available.filter(a => !/embedding/i.test(a));
    const allowPreview = String(process.env.ALLOW_PREVIEW_MODELS || '').toLowerCase() === '1';
    const previewFiltered = nonEmbedding.filter(a => {
      if (allowPreview) return true;
      // filter model names that include preview/pro tokens or explicitly say 'preview' or 'pro'
      return !/(?:preview|pro|beta|preview-image|preview-text)/i.test(String(a));
    });
    const candidates = nonEmbedding.length ? nonEmbedding : available.slice();
    // prefer the previewFiltered set if it's non-empty
    const effectiveCandidates = (previewFiltered.length ? previewFiltered : candidates.slice());

    // Construct an image-priority list when image data is provided.
    const isImageInput = !!(imageBase64 || imageDataUrl);
    if (isImageInput) {
      // Look for models with 'image' or 'flash-image' tokens in their name
      const imageCandidates = effectiveCandidates.filter(a => /image|flash-image|vision|img/i.test(a));
      // prefer stable flash-image variants first
      const preferredImageOrder = ['gemini-2.5-flash-image', 'gemini-2.5-flash', 'gemini-flash-latest'];
      for (const pref of preferredImageOrder) {
        const found = imageCandidates.find(a => a.replace(/^models\//,'').toLowerCase().includes(pref.toLowerCase()));
        if (found && !models.includes(found)) models.push(found);
      }
      // append remaining image-capable candidates
      for (const a of imageCandidates) if (!models.includes(a)) models.push(a);
      // finally append a short fallback of non-image candidates (limit to 3)
      for (const a of effectiveCandidates) {
        if (models.length >= 6) break; // keep attempts small
        if (!models.includes(a)) models.push(a);
      }
    } else {
      // Non-image input: prefer stable text flash models first, then a short
      // set of candidates rather than trying the entire list.
      for (const pref of PREFERRED_MODELS) {
        const found = candidates.find(a => a.replace(/^models\//,'').toLowerCase().includes(pref.toLowerCase()));
        if (found && !models.includes(found)) models.push(found);
      }
      // append at most 3 remaining candidates
      for (const a of effectiveCandidates) {
        if (models.length >= 4) break;
        if (!models.includes(a)) models.push(a);
      }
    }
  }
  // Force 'gemini-2.5-flash' to the front if present and not already first
  try {
    const idx = models.findIndex(m => /gemini-2\.5-flash/i.test(m));
    if (idx > 0) {
      const v = models.splice(idx, 1)[0];
      models.unshift(v);
      console.log('[aiService] forcing gemini-2.5-flash as top model');
    }
  } catch (e) {}
  // fallback to preferred models if listing didn't return anything
  if (!models.length) models = PREFERRED_MODELS.map(m => 'models/' + m);

  // Build a minimal prompt. We include a short fingerprint and a truncated
  // base64 chunk of the image (if available) to stay under provider size limits.
  const basePrompt = `Identify the product shown. Reply as JSON {"summary","tags","confidence"}.\n`;

  let lastErr = null;
  for (const model of models) {
    try {
      // Rate limit between requests to avoid 429s
      const now = Date.now();
      const since = now - lastRequestTime;
      if (since < MIN_REQUEST_INTERVAL) {
        const wait = MIN_REQUEST_INTERVAL - since;
        await new Promise(r => setTimeout(r, wait));
      }
      lastRequestTime = Date.now();
  // Use the REST endpoint with API key param to authenticate
  // The endpoint expects just the model name without 'models/' prefix in the URL path

      // Prepare truncated base64 and a short fingerprint note BEFORE attempting
      // the official client so variables used in the client path are defined.
      const fingerprint = sha1(cacheKeySeed).slice(0, 12);
      const shortNote = `Image fingerprint:${fingerprint}`;

      // Prefer compact base64 if provided; otherwise extract from data URL.
      const MAX_BASE64_CHARS = 28000; // conservative cap (~21KB binary)
      let base64ToInclude = '';
      if (imageBase64) base64ToInclude = imageBase64;
      else if (imageDataUrl) {
        const parts = (imageDataUrl || '').split('base64,');
        base64ToInclude = parts.length > 1 ? parts[1] : '';
      }
      if (base64ToInclude.length > MAX_BASE64_CHARS) {
        console.warn('[aiService] truncating base64 included in prompt to', MAX_BASE64_CHARS, 'chars');
        base64ToInclude = base64ToInclude.slice(0, MAX_BASE64_CHARS);
      }

      // First, if the official client is available, try to use it in the same
      // way your other app does: instantiate GoogleGenerativeAI, call
      // getGenerativeModel({ model }), then call generateContent(prompt).
      // Keep this simple and deterministic (no heavy model-list filtering).
      const modelName = model.replace(/^models\//, '');
      if (GoogleGenerativeAIClient) {
        try {
          // instantiate like your other app (the client constructor can accept the apiKey directly)
          const genAI = new GoogleGenerativeAIClient(GEMINI_API_KEY);
          // models to try: prefer explicit env list, otherwise fall back to our preferred list
          const envModels = (process.env.GEMINI_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
          const modelsToTry = envModels.length ? envModels : PREFERRED_MODELS.slice();
          // ensure the current candidate model is first
          if (!modelsToTry.includes(modelName)) modelsToTry.unshift(modelName);

              // Prefer client-supplied OCR text if provided; otherwise try Vision OCR
              let ocrText = ocrTextFromClient || null;
              if (!ocrText) {
                try { ocrText = await performOCRIfAvailable(base64ToInclude); if (ocrText) console.log('[aiService] OCR text detected:', String(ocrText).slice(0,200)); } catch (e) {}
              }

                // Build a token-safe prompt: do NOT embed full base64. Prefer OCR text and a short image
                // fingerprint/size note so we don't waste tokens or hit quota.
                const approxBytes = base64ToInclude ? Math.ceil((base64ToInclude.length - ('data:image/jpeg;base64,'.length || 0)) * 3 / 4) : 0;
                let promptTextClient = basePrompt + shortNote + `\nImage omitted from prompt to conserve tokens. Approx size: ${approxBytes} bytes.` + '\n';
                if (ocrText) promptTextClient += 'OCR_TEXT:\n' + ocrText + '\n';
                else promptTextClient += 'OCR_TEXT: (none detected)\n';

          for (const mn of modelsToTry) {
            try {
              // skip models temporarily marked rate-limited
              const rlUntil = modelRateLimitedUntil.get(mn) || 0;
              if (rlUntil > Date.now()) {
                console.warn('[aiService] skipping rate-limited model', mn, 'until', new Date(rlUntil).toISOString());
                continue;
              }
              console.log('[aiService] trying official client model', mn);
              const modelHandle = genAI.getGenerativeModel({ model: mn });
              // try the simple string-based call like in your app
              const result = await modelHandle.generateContent(promptTextClient);

              // result may expose `.response` with a `.text()` helper, or be a direct shape
              let response = result && (result.response || result);
              let textOut = null;
              try {
                if (response && typeof response.text === 'function') {
                  textOut = await response.text();
                }
              } catch (e) {
                // fall through
              }

              // fallback parsing of common shapes
              if (!textOut && result && result.output && Array.isArray(result.output)) {
                textOut = result.output.map(o => (o && o.content && o.content.map ? o.content.map(c => c.text || '').join('') : '')).join('\n');
              }
              if (!textOut && result && result.candidates && result.candidates.length) {
                const c = result.candidates[0];
                if (c && c.content) textOut = Array.isArray(c.content) ? c.content.map(cc => cc.text || '').join('') : (c.content.text || null);
              }
              if (!textOut && typeof result === 'string') textOut = result;

              if (textOut) {
                // attempt to parse JSON if returned
                let parsed = null;
                try {
                  const m = textOut.match(/\{[\s\S]*\}/);
                  const cand = m ? m[0] : textOut;
                  parsed = cand ? JSON.parse(cand) : null;
                } catch (e) {}
                const final = parsed || { summary: String(textOut || '').slice(0, 1000), tags: [], confidence: null };
                const out = Object.assign({}, final, { provider: 'gemini', model: mn, mocked: false, via: 'official-client' });
                cache.set(key, { value: out, expiry: now + CACHE_TTL });
                return out;
              }
            } catch (e) {
              // If provider indicates a quota/rate-limit, try to honor any retry info and mark model temporarily
              try {
                const status = e && e.response && e.response.status;
                if (status === 429) {
                  console.warn('[aiService] official client model rate-limited for', mn, e && e.message);
                  // parse RetryInfo or Retry-After header if present
                  let retryAfterMs = 30000; // default 30s
                  try {
                    const rdata = e.response && e.response.data;
                    if (rdata && rdata.retryDelay) {
                      const s = String(rdata.retryDelay || '').trim();
                      const m = s.match(/(\d+)(?:\.(\d+))?s/);
                      if (m) retryAfterMs = parseInt(m[1], 10) * 1000;
                    }
                    const ra = (e.response && e.response.headers && (e.response.headers['retry-after'] || e.response.headers['Retry-After'])) || null;
                    if (ra && !isNaN(Number(ra))) retryAfterMs = Math.max(retryAfterMs, Number(ra) * 1000);
                  } catch (x) {}
                  modelRateLimitedUntil.set(mn, Date.now() + retryAfterMs);
                  // continue to next model instead of treating as fatal
                  continue;
                }
              } catch (xx) {}
              console.warn('[aiService] official client model failed for', mn, e && e.message);
              // try next model
              continue;
            }
          }
        } catch (e) {
          console.warn('[aiService] official client usage failed', e && e.message);
        }
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateText?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      // Prefer client OCR text when present, otherwise run Vision OCR for REST path
      let ocrTextRest = ocrTextFromClient || null;
      if (!ocrTextRest) {
        try { ocrTextRest = await performOCRIfAvailable(base64ToInclude); } catch (e) {}
      }
  // Build REST prompt without embedding base64; include OCR text if available and a short note
  const approxBytesRest = base64ToInclude ? Math.ceil((base64ToInclude.length - ('data:image/jpeg;base64,'.length || 0)) * 3 / 4) : 0;
  const promptText = basePrompt + shortNote + `\nImage omitted from prompt to conserve tokens. Approx size: ${approxBytesRest} bytes.` + '\n' + (ocrTextRest ? ('OCR_TEXT:\n' + ocrTextRest + '\n') : 'OCR_TEXT: (none detected)\n');
      const body = {
        prompt: { text: promptText },
        maxOutputTokens: 256,
      };

      let resp = null;
      try {
        resp = await axios.post(url, body, { timeout: 15000 });
      } catch (e) {
        // If provider responded with an HTTP error body (e.response), log useful parts
        if (e && e.response) {
          try {
            const status = e.response.status;
            let respText = null;
            try { respText = typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data).slice(0, 2000); } catch (x) { respText = String(e.response.data).slice(0,2000); }
            console.warn('[aiService] model request failed for', model, 'status', status, 'body:', respText);
            // If we got a 404 for this model, attempt to list available models
            if (status === 404) {
              try {
                const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`;
                const listResp = await axios.get(listUrl, { timeout: 8000 });
                const md = listResp && listResp.data && listResp.data.models ? listResp.data.models : null;
                if (Array.isArray(md) && md.length) {
                  const found = md.map(m => m.name || m.model || m.id).filter(Boolean);
                  console.warn('[aiService] model', model, 'returned 404. Available models for this key:', found.slice(0,20));
                } else {
                  console.warn('[aiService] model', model, 'returned 404 and no models were listed for this key');
                }
              } catch (xx) {
                console.warn('[aiService] failed to list models after 404', xx && xx.message);
              }
            } else if (status === 429) {
              // Rate limited by REST path. Honor Retry-After or RetryInfo and mark model as rate-limited.
              try {
                let retryAfterMs = 30000;
                const rdata = e.response.data;
                if (rdata && rdata.retryDelay) {
                  const s = String(rdata.retryDelay || '').trim();
                  const m = s.match(/(\d+)(?:\.(\d+))?s/);
                  if (m) retryAfterMs = parseInt(m[1], 10) * 1000;
                }
                const ra = (e.response.headers && (e.response.headers['retry-after'] || e.response.headers['Retry-After'])) || null;
                if (ra && !isNaN(Number(ra))) retryAfterMs = Math.max(retryAfterMs, Number(ra) * 1000);
                modelRateLimitedUntil.set(model, Date.now() + retryAfterMs);
                console.warn('[aiService] marking model as rate-limited', model, 'for', retryAfterMs, 'ms');
                // Continue to next model rather than throwing
                continue;
              } catch (x) {}
            }
          } catch (x) {}
        } else {
          console.warn('[aiService] model request failed for', model, e && e.message);
        }
        // If not handled specially above, escalate by setting lastErr and moving on
        lastErr = e;
        continue;
      }
      const data = resp && resp.data ? resp.data : null;

      // Attempt to extract text content from common response shapes
      let textOut = null;
      if (data) {
        // v1beta models sometimes return candidates or output or safety etc.
        if (data.candidates && data.candidates.length && data.candidates[0].content) {
          textOut = Array.isArray(data.candidates[0].content) ? data.candidates[0].content.map(c=>c.text||'').join('') : (data.candidates[0].content.text || null);
        }
        if (!textOut && data.candidates && data.candidates.length && typeof data.candidates[0] === 'string') textOut = data.candidates[0];
        if (!textOut && data.output && Array.isArray(data.output) && data.output.length) {
          // naive join of text fragments
          textOut = data.output.map(o => (o.content && o.content.map ? o.content.map(c=>c.text||'').join('') : '')).join('\n');
        }
        if (!textOut && typeof data.text === 'string') textOut = data.text;
        if (!textOut && typeof data.outputText === 'string') textOut = data.outputText;
        if (!textOut) textOut = JSON.stringify(data).slice(0, 2000);
      }

      // parse JSON if model returned JSON string
      let parsed = null;
      try {
        // some responses may have leading/trailing content; attempt to find first JSON block
        const m = textOut && textOut.match(/\{[\s\S]*\}/);
        const candidate = m ? m[0] : textOut;
        parsed = candidate ? JSON.parse(candidate) : null;
      } catch (e) {
        // ignore JSON parse errors
      }

      const result = parsed || { summary: String(textOut || '').slice(0, 1000), tags: [], confidence: null };
      const out = Object.assign({}, result, { provider: 'gemini', model, mocked: false });
      cache.set(key, { value: out, expiry: now + CACHE_TTL });
      return out;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  // All models failed — bubble up last error for logging and return null so caller falls back
  throw lastErr || new Error('All models failed');
}

module.exports = { analyzeImage };
