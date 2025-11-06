import React, { useEffect, useState } from "react";
import "./header.css";
import { MdAccountCircle } from "react-icons/md";
import { VscAccount } from "react-icons/vsc";
import ThemeToggle from "./ThemeToggle.jsx";

export const RIGHT_COL_WIDTH = 48; // keeps header-right alignment consistent with the design

export default function Header() {
  const [devOpen, setDevOpen] = useState(false);
  const devToolsEnabled =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEV_TOOLS === '1') ||
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV);
  const [brand, setBrand] = useState({ wght: 900, wdth: 90, track: -8 }); // track in thousandths of em

  // Initialize brand tuning vars from localStorage if present
  useEffect(() => {
    try {
      const root = document.documentElement;
      const saved = JSON.parse(localStorage.getItem('dr_brand_tuning') || 'null');
      if (saved && typeof saved === 'object') {
        if (saved.wght) root.style.setProperty('--brand-wght', String(saved.wght));
        if (saved.wdth) root.style.setProperty('--brand-wdth', String(saved.wdth));
        if (saved.track) root.style.setProperty('--brand-track', String(saved.track));
      }
      // reflect current CSS vars into local state for slider display
      const styles = getComputedStyle(root);
      const wghtVar = parseInt(styles.getPropertyValue('--brand-wght').trim() || '900', 10);
      const wdthVar = parseFloat((styles.getPropertyValue('--brand-wdth') || '90%').replace('%','').trim());
      const trackStr = (styles.getPropertyValue('--brand-track') || '-0.008em').trim();
      const trackEm = parseFloat(trackStr.replace('em',''));
      const trackThousand = Number.isFinite(trackEm) ? Math.round(trackEm * 1000) : -8;
      setBrand({ wght: Number.isFinite(wghtVar) ? wghtVar : 900, wdth: Number.isFinite(wdthVar) ? wdthVar : 90, track: trackThousand });
    } catch (e) {}
  }, []);

  function setBrandVar(key, value) {
    try {
      const root = document.documentElement;
      root.style.setProperty(key, String(value));
      const current = JSON.parse(localStorage.getItem('dr_brand_tuning') || '{}');
      if (key === '--brand-wght') current.wght = value;
      if (key === '--brand-wdth') current.wdth = value;
      if (key === '--brand-track') current.track = value;
      localStorage.setItem('dr_brand_tuning', JSON.stringify(current));
      // update local state mirror for labels
      setBrand((prev) => {
        const next = { ...prev };
        if (key === '--brand-wght') next.wght = parseInt(String(value), 10);
        if (key === '--brand-wdth') next.wdth = parseFloat(String(value).replace('%',''));
        if (key === '--brand-track') {
          const em = parseFloat(String(value).replace('em',''));
          next.track = Math.round(em * 1000);
        }
        return next;
      });
    } catch (e) {}
  }
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
        {/* Left brand (text only, left-justified and middle aligned) */}
        <div className="flex items-center gap-3">
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="dr-brand-title">Dynamic Resale</h1>
            </div>
            <div className="mt-1 flex items-center gap-0">
              <span className="dr-brand-subtext">find. collect. sell.</span>
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
                  <div className="text-xs text-muted-dynamic mb-1">Brand tuning</div>
                  <div className="flex flex-col gap-2 mb-2">
                    <label className="flex items-center justify-between gap-2 text-xs">
                      <span>Weight</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="700"
                          max="950"
                          step="10"
                          value={brand.wght}
                          onChange={(e) => setBrandVar('--brand-wght', e.target.value)}
                        />
                        <span className="tabular-nums">{brand.wght}</span>
                      </div>
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs">
                      <span>Width</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="85"
                          max="100"
                          step="1"
                          value={brand.wdth}
                          onChange={(e) => setBrandVar('--brand-wdth', e.target.value + '%')}
                        />
                        <span className="tabular-nums">{brand.wdth}%</span>
                      </div>
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs">
                      <span>Tracking</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="-30"
                          max="10"
                          step="1"
                          value={brand.track}
                          onChange={(e) => setBrandVar('--brand-track', (Number(e.target.value) / 1000) + 'em')}
                        />
                        <span className="tabular-nums">{(brand.track/1000).toFixed(3)}em</span>
                      </div>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => {
                          setBrandVar('--brand-wght', '900');
                          setBrandVar('--brand-wdth', '90%');
                          setBrandVar('--brand-track', '-0.008em');
                        }}
                      >
                        Reset brand to defaults
                      </button>
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={async () => {
                          const css = `:root {\n  --brand-wght: ${brand.wght};\n  --brand-wdth: ${brand.wdth}%;\n  --brand-track: ${(brand.track/1000).toFixed(3)}em;\n}`;
                          try {
                            await navigator.clipboard.writeText(css);
                            alert('Copied CSS to clipboard. Paste into src/components/header.css :root block.');
                          } catch (e) {
                            console.log(css);
                            alert('Copy failed. CSS written to console.');
                          }
                        }}
                      >
                        Copy CSS
                      </button>
                    </div>
                  </div>
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
              <VscAccount className="h-6 w-6" style={{ color: "var(--accent-strong)" }} />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
