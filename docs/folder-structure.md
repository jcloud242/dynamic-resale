# Folder structure and roles

This document explains how folders map to responsibilities, why specific files live where they do, and the structure we are adopting going forward. It also includes DX helpers and a quick guide for adding new pages/features.

## Adopted structure

We are using a light, feature-aware structure. It clarifies feature modules vs UI widgets and separates non-React utilities.

```
src/
	pages/                      # route-level screens (Home, History, Analytics, ...)
	components/                 # app chrome + small, generic UI (Header, BottomNav, ThemeToggle, MetricBox)
	shared/
		features/                 # reusable domain features used across pages
			search/
				SearchBar.jsx
			results/
				ResultList.jsx
				ResultCard.jsx
			camera/
				CameraModal.jsx
		ui/                       # reusable presentation-only widgets (charts, icons, etc.)
			charts/
				RechartsAnalytics.jsx
				MiniChart.jsx
		styles/                   # shared CSS used by features/ui
			camera.css
			resultcard.css
			resultchart.css
			searchbar.css
	services/                   # API/IO, adapters, client-side services
		api.js
	lib/                        # non-React helpers/utilities
		titleHelpers.js
```

### What belongs in each folder

- pages/
	- Screens navigated by the app (Home, History, Analytics, Collections, etc.).
	- Compose features and UI. Hold page-specific state and layout.
	- Example: `src/pages/Analytics.jsx`.

- components/
	- App frame and small generic components (Header, nav, toggles, KPI tiles).
	- Page-agnostic and low-level. No domain logic inside where possible.
	- Example: `src/components/Header.jsx`, `src/components/BottomNav.jsx`.

- shared/features/
	- Reusable domain modules (search, results, camera) used by multiple pages.
	- Can contain some state/logic related to that feature but avoid page assumptions.
	- Example: `src/shared/features/results/ResultList.jsx`.

- shared/ui/
	- Pure presentation widgets (charts, icons, little visual helpers).
	- No data fetching or business logic.
	- Example: `src/shared/ui/charts/RechartsAnalytics.jsx`.

- shared/styles/
	- CSS that’s shared across features/ui components.
	- Example: `src/shared/styles/resultcard.css`.

- services/
	- API clients, adapters, and IO integration.
	- Example: `src/services/api.js`.

- lib/
	- Non-React utilities and helpers (formatters, parsers, math, etc.).
	- Example: `src/lib/titleHelpers.js`.

### Example imports with aliases

```js
import SearchBar from "@features/search/SearchBar.jsx";
import ResultList from "@features/results/ResultList.jsx";
import RechartsAnalytics from "@ui/charts/RechartsAnalytics.jsx";
import { buildTitle } from "@lib/titleHelpers.js";
```

## DX Helpers

Path aliases and a couple of tiny config tweaks keep imports short and consistent as the tree grows.

Vite aliases (`vite.config.js`):

```js
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
	resolve: {
		alias: {
			'@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
			'@components': fileURLToPath(new URL('./src/components', import.meta.url)),
			'@features': fileURLToPath(new URL('./src/shared/features', import.meta.url)),
			'@ui': fileURLToPath(new URL('./src/shared/ui', import.meta.url)),
			'@styles': fileURLToPath(new URL('./src/shared/styles', import.meta.url)),
			'@services': fileURLToPath(new URL('./src/services', import.meta.url)),
			'@lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
	},
})
```

Editor IntelliSense (`jsconfig.json`):

```json
{
	"compilerOptions": {
		"baseUrl": ".",
		"paths": {
			"@pages/*": ["src/pages/*"],
			"@components/*": ["src/components/*"],
			"@features/*": ["src/shared/features/*"],
			"@ui/*": ["src/shared/ui/*"],
			"@styles/*": ["src/shared/styles/*"],
			"@services/*": ["src/services/*"],
			"@lib/*": ["src/lib/*"]
		}
	}
}
```

---

## How to add a new page (example: Collections)

Goal: Add a Collections page that lists items you’ve saved.

1) Create the page component
	 - File: `src/pages/Collections.jsx`
	 - Purpose: route-level screen that composes shared features (e.g., ResultList) and your own page logic.

2) Add page-specific styles (optional)
	 - If you need custom styles just for this page, create: `src/pages/collections.css`
	 - Or if styles are reusable UI, place CSS under `src/shared/styles/`.

3) Use features/UI widgets
	 - Import with aliases:
		 - `import ResultList from '@features/results/ResultList.jsx'`
		 - `import SearchBar from '@features/search/SearchBar.jsx'` (if needed)
		 - `import MiniChart from '@ui/charts/MiniChart.jsx'` (if needed)

4) Wire navigation
	 - This app uses tab-style navigation in `src/App.jsx` (state variable `active`).
	 - Add the new case and a BottomNav tab for `collections`.
	 - Example for `src/App.jsx`:

	 ```jsx
	 import React, { useState } from 'react'
	 import Collections from './pages/Collections'

	 function App() {
		 const [active, setActive] = useState('home');
		 return (
			 <div className="App">
				 <Header />
				 {active === 'home' && <Home />}
				 {active === 'history' && <History />}
				 {active === 'analytics' && <Analytics />}
				 {active === 'collections' && <Collections />}
				 <BottomNav active={active} onNavigate={(id) => setActive(id)} />
			 </div>
		 )
	 }
	 ```

	 - Update `src/components/BottomNav.jsx` to include a Collections tab (e.g., id="collections").

5) Persist data (optional)
	 - For a simple local prototype, store saved items in `localStorage`.
	 - For server-backed collections, add functions to `src/services/api.js` and call them from the page.

6) Keep it modular
	 - If Collections grows its own components, consider `src/shared/features/collections/` and import with `@features/...`.
