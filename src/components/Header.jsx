// React import not required for JSX with Vite + React 17+ JSX runtime
import "./header.css";
import { LuScanBarcode } from "react-icons/lu";
import { MdAccountCircle } from "react-icons/md";
import ThemeToggle from "./ThemeToggle.jsx";
import { useState } from "react";

export const RIGHT_COL_WIDTH = 48; // keeps header-right alignment consistent with the design

export default function Header() {
  const [devOpen, setDevOpen] = useState(false);
  const devToolsEnabled =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEV_TOOLS === '1') ||
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV);
  return (
    <header
      className="w-full border-b"
      style={{
        // expose shared CSS var so other rows can align the right-most column
        // @ts-ignore
        "--right-col-w": `${RIGHT_COL_WIDTH}px`,
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-3 grid grid-cols-[1fr_var(--right-col-w)] items-center">
        {/* Left brand */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <LuScanBarcode className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                Dynamic Resale
              </h1>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-dynamic">
              <span>Find, Price, Collect</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
        {/* Right account icon, fixed width for alignment */}
        <div className="flex items-center justify-end gap-2" style={{ width: `var(--right-col-w)` }}>
          {devToolsEnabled && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                title="Dev tools"
                className="inline-flex h-9 items-center justify-center rounded-md px-2 text-xs border"
                onClick={() => setDevOpen((o) => !o)}
              >
                Dev
              </button>
              {devOpen && (
                <div
                  style={{ position: 'absolute', right: 0, top: '110%', zIndex: 50 }}
                  className="rounded-md border bg-white dark:bg-neutral-900 text-foreground shadow-md p-2 min-w-[200px]"
                >
                  <div className="text-xs text-muted-dynamic mb-1">Developer tools</div>
                  <button
                    className="w-full text-left rounded border px-2 py-1 text-sm mb-2"
                    onClick={async () => {
                      try {
                        await fetch('/api/cache/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                      } catch (e) {}
                      try { localStorage.removeItem('dr_recent'); } catch (e) {}
                      try { localStorage.removeItem('dr_last_analytics_item'); } catch (e) {}
                      try {
                        // clear session estimates
                        Object.keys(sessionStorage).forEach((k) => { if (k && k.startsWith('est:')) sessionStorage.removeItem(k); });
                      } catch (e) {}
                      setDevOpen(false);
                      alert('Caches cleared');
                    }}
                  >
                    Clear caches
                  </button>
                  <div className="text-[11px] text-muted-dynamic">Uses /api/cache/clear and clears local/session cache keys</div>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            aria-label="Account"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md"
          >
            <span>
              <MdAccountCircle className="h-6 w-6" style={{ color: "#ED254E" }} />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
