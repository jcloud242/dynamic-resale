import React, { useState, useEffect } from 'react';
import SearchBar from '../shared/SearchBar.jsx';
import CameraModal from '../shared/CameraModal.jsx';
import ResultList from '../shared/ResultList.jsx';
import { postSearch } from '../services/api.js';
import './home.css';
import { FaHistory } from 'react-icons/fa';

export default function Home() {
  const [recent, setRecent] = useState([]);
  // control how many recent items are visible in the panel
  const [recentVisibleCount, setRecentVisibleCount] = useState(4);
  const [active, setActive] = useState(null);
  const [camera, setCamera] = useState({ open: false, mode: 'barcode' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // cache ongoing and completed searches to avoid duplicate network calls
  const searchCache = React.useRef(new Map());
  const lastQueryRef = React.useRef(null);
  const scansCountRef = React.useRef(Number(localStorage.getItem('dr_scan_count') || '0'));

  useEffect(() => {
    // load last 3 recent from localStorage (mock)
    const r = JSON.parse(localStorage.getItem('dr_recent') || '[]');
    // on first visit we have more real-estate — show up to 4
    setRecent(r.slice(0, recentVisibleCount));
  }, []);

  async function handleSearch(query, opts = {}) {
    if (!query) return;
    // dedupe identical queries fired within a short span
    if (lastQueryRef.current === query) return;
    lastQueryRef.current = query;

    // return cached promise/result when available
    const cached = searchCache.current.get(query);
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
    setActive({ query, title: 'Searching…', upc: query, thumbnail: '/vite.svg', avgPrice: null, minPrice: null, maxPrice: null, soldListings: [], fetchedAt: new Date().toISOString() });
  }
  setError(null);
    const p = postSearch({ query }).then((res) => {
      // persist into cache
      searchCache.current.set(query, Promise.resolve(res));
      return res;
    }).catch((err) => {
      searchCache.current.delete(query);
      throw err;
    });
    // store promise to allow concurrent callers to share
    searchCache.current.set(query, p);

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
      saveRecent(res);
      // increment scan metric
      scansCountRef.current = (scansCountRef.current || 0) + 1;
      try { localStorage.setItem('dr_scan_count', String(scansCountRef.current)); } catch (e) {}
      // if result was cached and silentRefresh is requested, refresh in background
      if (res && res.cached && opts.silentRefresh) {
        (async () => {
          try {
            const fresh = await postSearch({ query, force: true });
            // only update UI if user is still viewing same query
            if (lastQueryRef.current === query) setActive(fresh);
            // update recent storage with fresh result
            saveRecent(fresh);
          } catch (e) {
            // ignore background refresh failures
            console.warn('Background refresh failed', e && e.message);
          }
        })();
      }
      return res;
    } catch (err) {
      console.error('Search error', err);
      setError(err && (err.info || err.message) || 'Search failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function saveRecent(res) {
    const r = JSON.parse(localStorage.getItem('dr_recent') || '[]');
    // move existing entry to front or add new
    const idx = r.findIndex((it) => it && it.query === res.query);
    if (idx !== -1) {
      r.splice(idx, 1);
      r.unshift(res);
    } else {
      r.unshift(res);
    }
    try { localStorage.setItem('dr_recent', JSON.stringify(r.slice(0, 10))); } catch (e) {}
    // after a new search/scan, reduce visible area to 3 to keep focus on results
    setRecent(r.slice(0, 3));
    setRecentVisibleCount(3);
  }

  function clearRecent() {
    try { localStorage.removeItem('dr_recent'); } catch (e) {}
    setRecent([]);
  }

  function handleDetected(payload) {
    // Convert payload to a query and run search
    if (payload.type === 'barcode') {
      handleSearch(payload.value, { silentRefresh: true, suppressCachedBadge: true, showPlaceholder: true }).catch((e) => {
        console.error('Search failed', e);
      });
    } else if (payload.type === 'image') {
      handleSearch(payload.value, { silentRefresh: true, suppressCachedBadge: true, showPlaceholder: true }).catch((e) => {
        console.error('Search failed', e);
      });
    }
  }

  return (
    <main className="dr-home">
      <div className="dr-actions">
        <SearchBar
          onSearch={handleSearch}
          onOpenCamera={() => setCamera({ open: true, mode: 'barcode' })}
          onOpenImage={() => setCamera({ open: true, mode: 'image' })}
        />
      </div>

      <section className="dr-results">
        {loading && <div className="dr-loading">Searching…</div>}
        {error && <div className="dr-error">Error: {typeof error === 'string' ? error : JSON.stringify(error)}</div>}
        {active && (
          <div>
            <ResultList items={[active]} active />
          </div>
        )}
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
           <div className="dr-recent-header">
             <button aria-label="Open history" className="dr-history-btn" onClick={() => { /* navigate to history page later */ }}>
               <FaHistory size={16} />
               <h3 style={{margin:0}}>Recent</h3>
             </button>
           </div>
            <div>
              <button className="dr-clear" onClick={() => { clearRecent(); }} style={{fontSize:12,padding:'6px 8px' }}>Clear Recent</button>
            </div>
          </div>
          <div className={`dr-recent-wrapper ${recentVisibleCount <= 3 ? 'small' : ''}`}>
            <ResultList items={recent} />
          </div>
        </div>
      </section>
      {camera.open && (
        <CameraModal
          mode={camera.mode}
          onClose={() => setCamera({ open: false, mode: camera.mode })}
          onDetected={handleDetected}
        />
      )}
    </main>
  );
}
