import { useState, useEffect, useRef } from "react";
import "@styles/page.css";
import "./home.css";
import SearchHeader from "@features/search/SearchHeader.jsx";
import ResultList from "@features/results/ResultList.jsx";
import { postSearch } from "@services/api.js";
import { cleanTitle, extractYear, extractPlatform } from "@lib/titleHelpers.js";
import { MdHistory } from "react-icons/md";

export default function Home({ onSearchComplete = null, onNavigateToAnalytics = null }) {
  const [recent, setRecent] = useState([]);
  // control how many recent items are visible in the panel
  const [recentVisibleCount, setRecentVisibleCount] = useState(4);

  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // show starter only when there's no active search result; do not persist a 'seen' flag
  const [showStarter, setShowStarter] = useState(true);
  // cache ongoing and completed searches to avoid duplicate network calls
  const searchCache = useRef(new Map());
  const lastQueryRef = useRef(null);
  const scansCountRef = useRef(
    Number(localStorage.getItem("dr_scan_count") || "0")
  );

  useEffect(() => {
    // load last 3 recent from localStorage (mock)
    const r = JSON.parse(localStorage.getItem("dr_recent") || "[]");
    // on first visit we have more real-estate — show up to 4
    setRecent(r.slice(0, recentVisibleCount));
    // intentionally run once on mount; recentVisibleCount initial value is 4
    // subsequent updates to recentVisibleCount are driven by saveRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: until the backend /api/search is exercised, this app will show
  // locally persisted mock data stored in localStorage under `dr_recent`.
  // Use the search bar or scan a barcode to populate real search results.

  // ensure starter appears whenever there is no active result (launch/refresh)
  useEffect(() => {
    try {
      setShowStarter(!active);
    } catch (e) {}
  }, [active]);

  async function handleSearch(query, opts = {}) {
    if (!query) return;
    // normalize if query is an object { query, category, source }
    let rawQuery = query;
    if (typeof query === "object" && query !== null) {
      rawQuery = query.query || query.label || "";
      opts = Object.assign({}, opts, {
        category: query.category,
        source: query.source,
        // forward the user's original typed input when a suggestion is chosen
        originalInput: query.originalInput,
      });
    }
    // hide starter so the skeleton/result region is visible during loading
    try { setShowStarter(false); } catch (e) {}
    // dedupe identical queries fired within a short span
    if (lastQueryRef.current === rawQuery) return;
    lastQueryRef.current = rawQuery;

    // return cached promise/result when available
    const cached = searchCache.current.get(rawQuery);
    if (cached) {
      setLoading(true);
      const res = await cached;
      setActive(res);
      setLoading(false);
      // update recent using same logic below but avoid duplicates
      saveRecent(res);
      return res;
    }

    setLoading(true);
    // show a lightweight placeholder immediately for fast camera scan feedback
    if (opts.showPlaceholder) {
      setActive({
        query: rawQuery,
        title: "Searching…",
        upc: rawQuery,
        thumbnail: "/vite.svg",
        avgPrice: null,
        minPrice: null,
        maxPrice: null,
        soldListings: [],
        fetchedAt: new Date().toISOString(),
      });
    }
    setError(null);
    // If the query came from a suggestion or was likely a full listing title, pass
    // a cleaned, broader `apiQuery` to the backend to avoid overly-specific
    // exact-title searches against eBay that return a single result.
    const shouldClean =
      opts &&
      opts.source &&
      ["server", "ebay", "suggest"].includes(String(opts.source));
    const apiQuery = shouldClean ? cleanTitle(rawQuery) || rawQuery : rawQuery;

    const p = postSearch({ query: apiQuery, opts })
      .then((res) => {
        // persist into cache
        // cache under the original rawQuery so UI history/recent keys remain stable
        searchCache.current.set(rawQuery, Promise.resolve(res));
        return res;
      })
      .catch((err) => {
        searchCache.current.delete(rawQuery);
        throw err;
      });
    // store promise to allow concurrent callers to share
    searchCache.current.set(rawQuery, p);

    try {
      const res = await p;
      // If caller requested to hide cached badge, only set cached flag when not suppressed
      if (opts.suppressCachedBadge && res && res.cached) {
        const copy = Object.assign({}, res);
        delete copy.cached;
        setActive(copy);
      } else {
        setActive(res);
      }
      // persist the latest analytics item so Analytics page picks the same result
  try { localStorage.setItem("dr_last_analytics_item", JSON.stringify(res)); window.dispatchEvent(new CustomEvent('dr_last_analytics_item_changed')); } catch (e) {}
      saveRecent(res);
      // notify parent that a search completed so nav can highlight Home
      try {
        if (typeof onSearchComplete === "function") onSearchComplete();
      } catch (e) {}
      // hide starter while an active result is shown
      try {
        setShowStarter(false);
      } catch (e) {}
      // increment scan metric
      scansCountRef.current = (scansCountRef.current || 0) + 1;
      try {
        localStorage.setItem("dr_scan_count", String(scansCountRef.current));
      } catch (e) {}
      // if result was cached and silentRefresh is requested, refresh in background
      if (res && res.cached && opts.silentRefresh) {
        (async () => {
          try {
            const fresh = await postSearch({ query, force: true });
            // only update UI if user is still viewing same query
            if (lastQueryRef.current === query) setActive(fresh);
            // update recent storage with fresh result
            saveRecent(fresh);
            try { localStorage.setItem("dr_last_analytics_item", JSON.stringify(fresh)); } catch (e) {}
          } catch (e) {
            // ignore background refresh failures
            console.warn("Background refresh failed", e && e.message);
          }
        })();
      }
      // If this was a barcode scan, run enrichment in background to fetch UPC/details
      // without blocking the initial UI. Update active if richer metadata returns
      // and the user is still viewing the same query.
      try {
        const isBarcode = !!(opts && opts.isBarcode);
        if (isBarcode) {
          (async () => {
            try {
              const enriched = await postSearch({
                query,
                force: true,
                opts: Object.assign({}, opts, { enrichUpcs: true }),
              });
              if (lastQueryRef.current === query && enriched) {
                setActive(enriched);
                saveRecent(enriched);
                try { localStorage.setItem("dr_last_analytics_item", JSON.stringify(enriched)); window.dispatchEvent(new CustomEvent('dr_last_analytics_item_changed')); } catch (e) {}
              }
            } catch (e) {
              // ignore background enrichment failures
            }
          })();
        }
      } catch (e) {}
      return res;
    } catch (err) {
      console.error("Search error", err);
      setError((err && (err.info || err.message)) || "Search failed");
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function saveRecent(res) {
    if (!res) return;
    // ensure a stable key and minimal fields exist
    const key = (res && (res.query || res.upc || res.title)) || "";
    // Store a slim entry to avoid localStorage quota errors (do NOT merge full result)
    const entry = {
      query: res.query || res.upc || key,
      title: res.title || res.query || key,
      upc: res.upc || null,
      thumbnail: res.thumbnail || "/vite.svg",
      avgPrice: res.avgPrice ?? null,
      minPrice: res.minPrice ?? null,
      maxPrice: res.maxPrice ?? null,
      // keep both category (for grouping) and platform (for badges)
      category: res.category || res.platform || null,
      platform: res.platform || extractPlatform(res.soldListings || [], res.title || res.query || "") || null,
      releaseYear: res.releaseYear || extractYear(res.soldListings || [], res.title || res.query || "") || null,
      fetchedAt: res.fetchedAt || new Date().toISOString(),
    };
    const r = JSON.parse(localStorage.getItem("dr_recent") || "[]");
    // move existing entry to front or add new (dedupe by query/upc/title key)
    const idx = r.findIndex((it) => it && (it.query === key || it.upc === key || it.title === key));
    if (idx !== -1) {
      r.splice(idx, 1);
      r.unshift(entry);
    } else {
      r.unshift(entry);
    }
    try {
      localStorage.setItem("dr_recent", JSON.stringify(r.slice(0, 10)));
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent("dr_recent_changed"));
    } catch (e) {}
    // after a new search/scan, reduce visible area to 3 to keep focus on results
    setRecent(r.slice(0, 3));
    setRecentVisibleCount(3);

    // persist to server-side recent cache (best-effort)
    try {
      fetch("/api/recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: entry.query, title: entry.title }),
      }).catch(() => {});
    } catch (e) {}
  }

  function clearRecent() {
    try {
      localStorage.removeItem("dr_recent");
    } catch (e) {}
    setRecent([]);
  }

  function handleDetected(payload) {
    // detection forwarded from CameraModal
    // Convert payload to a query and run search
    if (payload.type === "barcode") {
      // barcode scans should request UPC enrichment and be marked as barcode so
      // we can ensure the scanned UPC appears in the final metadata
      handleSearch(payload.value, {
        silentRefresh: true,
        suppressCachedBadge: true,
        showPlaceholder: true,
        enrichUpcs: true,
        isBarcode: true,
      }).catch((e) => {
        console.error("Search failed", e);
      });
    } else if (payload.type === "image") {
      // For now, mock an image-result so recent list shows a thumbnail instead of the raw data URL
      const mock = {
        query: "image-capture",
        title: "Photo lookup",
        upc: "image-capture",
        thumbnail: payload.value,
        avgPrice: null,
        minPrice: null,
        maxPrice: null,
        soldListings: [],
        fetchedAt: new Date().toISOString(),
      };
      // show as active and save into recent list for quick inspection
      setActive(mock);
      saveRecent(mock);
    }
  }

  return (
  <main className="dr-page dr-home">
      <div className="dr-actions">
        <SearchHeader
          onSearch={handleSearch}
          onDetected={handleDetected}
          showScans={true}
        />
      </div>
      {/* Starter card: shows until first successful search or until dismissed */}
      {showStarter && !loading && (
        <div
          className={`dr-resultcard-wrap dr-starter-card ${
            loading ? "dr-loading" : ""
          }`}
        >
          <div className="dr-starter-inner">
            <div className="dr-starter-text">
              {loading
                ? "Searching…"
                : "Scan a barcode, take a photo or enter a search to get started."}
            </div>
          </div>
        </div>
      )}

      <section className="dr-results">
        {(loading || error || active) && !showStarter && (
          <div className="dr-resultcard-wrap" style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Search result</div>
              <button className="rounded border px-2 py-1 text-sm" onClick={()=>{ setActive(null); setError(null); }}>Dismiss</button>
            </div>
            {loading && (
              <div className="dr-resultcard-wrap" aria-hidden>
                <div className="dr-resultcard">
                  <div className="dr-thumb" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.12), rgba(0,0,0,0.06))', backgroundSize: '200% 100%', animation: 'dr-shimmer 1.2s infinite' }} />
                  <div className="dr-main" style={{ flex: 1 }}>
                    <div className="dr-title" style={{ height: 18, maxWidth: '70%', background: 'rgba(0,0,0,0.08)', borderRadius: 4 }} />
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <div style={{ width: 80, height: 16, background: 'rgba(0,0,0,0.06)', borderRadius: 999 }} />
                      <div style={{ width: 48, height: 16, background: 'rgba(0,0,0,0.06)', borderRadius: 999 }} />
                    </div>
                  </div>
                  <div className="dr-stats">
                    <div style={{ width: 64, height: 18, background: 'rgba(0,0,0,0.08)', borderRadius: 4 }} />
                  </div>
                </div>
              </div>
            )}
            {error && <div className="dr-error">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}
            {!loading && active && (
              <ResultList
                items={[active]}
                active
                hideChart={true}
                onAnalyticsClick={(it) => { try { if (onNavigateToAnalytics) onNavigateToAnalytics(it); } catch (e) {} }}
              />
            )}
          </div>
        )}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="dr-recent-header">
                <h3 style={{ margin: 0 }}>Recent</h3>
            </div>
            {/* Clear moved to History page to avoid accidental loss */}
          </div>
          <div
            className={`dr-recent-wrapper ${
              recentVisibleCount <= 3 ? "small" : ""
            }`}
          >
            <ResultList items={recent} />
          </div>
        </div>
      </section>
      {/* Camera modal handled by SearchHeader */}
    </main>
  );
}
