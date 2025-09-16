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
