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
