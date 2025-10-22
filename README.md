# Dynamic Resale (scaffold)

This repo contains a starter scaffold for the Dynamic Resale app (React frontend + Express backend).

Key pieces added:
- Frontend: React components in `src/` (Header, Home, SearchBar, ResultList, ResultCard, BottomNav)
- Backend: Express server in `server/` with a `/api/search` POST stub and `ebayAuth.js` helper
- `.env.example` added for EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and PORT

Run locally (two options):

1) Start frontend and backend separately

Install deps in root and server first:

```bash
# from project root
npm install
cd server && npm install
cd ..
```

Start server and frontend in separate terminals:

```bash
npm run start:server
npm run dev
```

2) Start both with one command (requires `npm-run-all`):

```bash
npm install
cd server && npm install
cd ..
npm run dev:all
```

Notes:
- Add your eBay credentials to a `.env` file at the repo root or in `server/` when you implement real API calls.
- The frontend proxies `/api` to `http://localhost:5001` via `vite.config.js`, so the frontend can call `/api/search`.

## Developer data & cache controls

You can enable lightweight developer tooling and data seeding via environment flags.

Frontend (Vite):

- Create a `.env` file at the project root (next to `package.json`) and set:

```
VITE_DEV_TOOLS=1         # show a small "Dev" menu in the header with a cache clear button
VITE_SUGGEST_SERVER=1    # enable server-backed suggestions (set to 0 to disable)
VITE_SUGGEST_EBAY=1      # enable eBay Browse suggestions (set to 0 to disable)
```

Backend (Express server):

- In `server/.env` (or root `.env` with `require('dotenv').config({...})` already set), you can configure:

```
# Port and marketplace
PORT=5001
EBAY_MARKETPLACE_ID=EBAY_US

# Developer helpers
SEED_SUGGESTIONS=1       # seed server-side recent suggestions from suggestions_seed.json on startup (dev only by default)
ALLOW_CACHE_CLEAR=1      # allow POST /api/cache/clear in non-dev environments (dev always allowed)
ENABLE_TRACE_LOG=0       # set to 1 to emit per-request timing logs to server/server.log
```

What the Dev menu does:

- Clear caches: calls `POST /api/cache/clear` and clears localStorage keys (`dr_recent`, `dr_last_analytics_item`) and sessionStorage estimate keys (`est:*`).
- Suggest toggles: controlled by `VITE_SUGGEST_SERVER` and `VITE_SUGGEST_EBAY`; set either to `0` to disable that source.


1) Mock vs real data (eBay)
Real search data

Set these in your root .env (the server reads root .env):
- EBAY_CLIENT_ID=your-id
- EBAY_CLIENT_SECRET=your-secret
(optional) EBAY_MARKETPLACE_ID=EBAY_US
Suggestions:
- VITE_SUGGEST_SERVER=1 uses server-side recent suggestions.
- VITE_SUGGEST_EBAY=1 enables eBay Browse-backed suggestions (only works if the server can get an OAuth token).

Mock data (no live eBay)
Leave EBAY_CLIENT_ID and EBAY_CLIENT_SECRET unset or empty.
The search endpoint returns a mock result.
The eBay suggestions endpoint will effectively return none (no token).
To keep the UI entirely local/offline:
- VITE_SUGGEST_SERVER=0
- VITE_SUGGEST_EBAY=0

Mixed options:
If you want “mock search” but still show local/server suggestions, set VITE_SUGGEST_SERVER=1 and VITE_SUGGEST_EBAY=0.
Tip: Vite flags (VITE_*) belong in the root .env; the server also reads from root .env, so you can keep everything in one file.






Short-query behavior and local-first suggestions:

- For queries shorter than 3 characters, the app suppresses server/eBay suggestions and only shows local Collections/Lists (with a startsWith bias for 2-char terms). Item suggestions require 3+ characters.
- Local sections (Collections / Lists / Items) always appear above live suggestions. Items are capped per section, and the total suggestion list is capped at 12.

Redis migration (short backlog):
- **Env changes**: add `REDIS_URL` and optionally `REDIS_TLS` to `.env` and deployment config.
- **Cache key strategy**: prefix keys with `search:` and include query normalized (lowercase, trimmed). Example: `search:123456789012`.
- **TTL strategy**: short TTL for barcode scans (30s) and longer TTL for manual searches (5-15 minutes). Consider a separate prefix for manual vs scan-based cache.
- **Infrastructure notes**: use managed Redis (e.g., AWS ElastiCache, Azure Cache, or Redis Cloud). Enable TLS and AUTH in production. Add connection retries and exponential backoff.
- **Migration steps**: install `ioredis`, add a thin cache wrapper that falls back to in-memory when Redis is unreachable, update `server/index.js` to use Redis for `getCache/setCache`, and run integration tests.

Caching Recommendation (local / small user base):
- **Use in-memory cache**: For this project (local laptop or small group of users), the current in-memory Map cache provides the best ROI — zero hosting cost, zero external dependencies, and simpler setup.
- **When to consider Redis**: If you scale to multiple server instances, or need persistence across restarts, move to Redis (managed or self-hosted). For occasional production use you can enable Redis later with minimal changes.
- **How to enable Redis later**: set `REDIS_URL` in `.env`, install `ioredis`, and swap `getCache/setCache` to a thin wrapper that prefers Redis but falls back to the `Map` when Redis is unavailable.

Next steps (recommended):
- Implement real eBay API integration in `/server/index.js` using `getEbayAppToken()`.
- Add barcode scanner UI + camera permission flow in `src/pages/Home.jsx`.
- Implement frontend routing and collection/history pages.
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


Legacy build note:

- The `j/` directory contains an older built version of the app. During the cleanup I removed the stale stylesheet that could conflict with `src/` styles. If you depend on the `j/` build, regenerate it with your build tooling or restore the assets.
