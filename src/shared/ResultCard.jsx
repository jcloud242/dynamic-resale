import React, { useState } from "react";
import "./resultcard.css";
import MiniChart from './MiniChart.jsx';
import { postSearchForce } from "../services/api.js";
import { formatResultTitle } from "./titleHelpers.js";
import { LuInfo } from "react-icons/lu";
import { MdOutlineTimeline, MdHistory, MdPlaylistAdd } from 'react-icons/md';
import { extractYear } from './titleHelpers.js';

// Chart rendering moved to `MiniChart.jsx` to keep ResultCard focused on layout.

export default function ResultCard({ item, isActive = false, hideChart = false, onAnalyticsClick = null }) {
  if (!item) return null;
  const [itemState, setItemState] = useState(item);
  // keep local state in sync when parent `item` prop changes
  React.useEffect(() => {
    setItemState(item);
  }, [item]);
  const fmt = (v) =>
    v === null || v === undefined ? "-" : Number(v).toFixed(2);
  const ts = itemState.fetchedAt
    ? new Date(itemState.fetchedAt).toLocaleString()
    : null;
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [toast, setToast] = useState(null);
  const [omitHelp, setOmitHelp] = useState(null);
  // demo mode: enable when local dev or when URL has ?demo=1 so you can test charts
  const demoEnabled =
    (typeof window !== "undefined" && window.location && window.location.search && window.location.search.indexOf("demo=1") !== -1) ||
    process.env.NODE_ENV !== "production";

  // Keep recent cards closed by default. Only open chart when item isActive
  const [showChart, setShowChart] = useState(Boolean(isActive));
  React.useEffect(() => {
    if (isActive) setShowChart(true);
  }, [isActive]);
  const INFO_AUTO_HIDE_MS = 3000;

  async function handleRefresh() {
    const query = itemState.query || itemState.upc;
    if (!query) return;
    setLoadingRefresh(true);
    setToast("Refreshing...");
    try {
      const res = await postSearchForce(query);
      // replace local state so UI updates immediately
      setItemState(Object.assign({}, itemState, res));
      setToast("Refreshed");
    } catch (e) {
      setToast("Refresh failed");
    } finally {
      setLoadingRefresh(false);
      setTimeout(() => setToast(null), 1500);
    }
  }
  async function handleAddToPlaylist(e) {
    // prevent bubbling to the refresh button
    try { e && e.stopPropagation && e.stopPropagation(); } catch (e) {}
    // placeholder action: show a toast so user sees it worked
    setToast('Added to playlist');
    setTimeout(() => setToast(null), 1200);
  }
  const { displayTitle, meta } = formatResultTitle(itemState);
  const metaLine = meta;
  // compute omitted count defensively (supports cached responses)
  const rawLen =
    (Array.isArray(itemState.soldListingsRaw) &&
      itemState.soldListingsRaw.length) ||
    itemState.rawCount ||
    0;
  const shownLen =
    (Array.isArray(itemState.soldListings) && itemState.soldListings.length) ||
    0;
  const omittedCount =
    typeof itemState.filteredCount === "number"
      ? itemState.filteredCount
      : Math.max(0, rawLen - shownLen);
  // Temporary demo injection: if no timeSeries present and running in development or demo mode,
  // inject a small mock series so the MiniChart renders for demos. Controlled by ?demo=1 or NODE_ENV.
  if ((!itemState.timeSeries || !itemState.timeSeries.avg || itemState.timeSeries.avg.length === 0) && demoEnabled) {
    // create a simple 12-point series with slight variation around avgPrice
    try {
      const base = (itemState.avgPrice && Number(itemState.avgPrice)) || 20;
      const fake = { avg: [], min: [], max: [] };
      for (let i = 0; i < 12; i++) {
        const v = Math.max(1, Math.round((base + (Math.sin(i / 2) * 3) + (Math.random() * 2 - 1)) * 100) / 100);
        fake.avg.push({ t: Date.now() - (11 - i) * 24 * 3600 * 1000, v });
        fake.min.push({ t: Date.now() - (11 - i) * 24 * 3600 * 1000, v: Math.max(1, v - (Math.random() * 4 + 1)) });
        fake.max.push({ t: Date.now() - (11 - i) * 24 * 3600 * 1000, v: v + (Math.random() * 4 + 1) });
      }
      itemState.timeSeries = fake;
    } catch (e) {}
  }

  return (
    <div className="dr-resultcard-wrap">
      <div className="dr-resultcard">
      <img
        src={item.thumbnail || "/vite.svg"}
        alt="thumb"
        className="dr-thumb"
      />
      <div className="dr-main">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="dr-title">{displayTitle}</div>
        </div>
        <div className="dr-meta" style={{marginTop:4,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {/* value-only badges: [Nintendo Switch] [2021] */}
          {(() => {
            const platformVal = itemState.platform || '';
            const yearVal = itemState.releaseYear || extractYear(itemState.soldListings || [], itemState.title || '') || '';
            const vals = [platformVal, yearVal].filter(Boolean);
            return vals.map((v, i) => (
              <span key={i} className="dr-flat-badge">{v}</span>
            ));
          })()}
        </div>
        <div className="dr-meta-sub" style={{marginTop:8,display:'flex',alignItems:'center',gap:8}}>
          <button
            className="dr-refresh-inline"
            aria-label="Refresh"
            onClick={handleRefresh}
            disabled={loadingRefresh}
            title="Refresh"
          >
            <MdHistory size={16} />
            <span className="dr-refresh-ts">{ts}
              <span
                className="dr-playlist-inline"
                title="Add to playlist"
                onClick={(e) => {
                  // prevent the playlist icon click from bubbling to the parent
                  // refresh button which would trigger a refresh
                  try {
                    e && e.stopPropagation && e.stopPropagation();
                    e && e.preventDefault && e.preventDefault();
                  } catch (err) {}
                }}
              >
                <MdPlaylistAdd size={16} />
              </span>
            </span>
          </button>
          {toast && <span className="dr-toast">{toast}</span>}
        </div>
      </div>
        <div className="dr-stats">
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end'}}>
          <div className="dr-stats-inner">
            <div className="dr-avg-row">
              <div className="dr-avg">${fmt(itemState.avgPrice)}</div>
              <button
                className="dr-avg-info"
                aria-label="Show price info"
                onClick={() => {
                  const used = (typeof itemState.sampleSize === 'number' && itemState.sampleSize >= 0)
                    ? itemState.sampleSize
                    : (Array.isArray(itemState.soldListings) ? itemState.soldListings.length : 0);
                  const raw = (typeof itemState.rawCount === 'number' && itemState.rawCount >= 0)
                    ? itemState.rawCount
                    : (Array.isArray(itemState.soldListingsRaw) ? itemState.soldListingsRaw.length : 0);
                  const gradedCount = (itemState.filteredBreakdown && itemState.filteredBreakdown.graded) || (itemState.gradedOmitted || 0);
                  let text = '';
                  if (used > 0) {
                    if (raw && raw > used) {
                      text = `*Average price based on ${used} sold`;
                    } else {
                      text = `*Average price based on ${used} sold`;
                    }
                  } else {
                    text = '*Average price could not be computed (no usable sold listings)';
                  }
                  if (gradedCount > 0) text += ` — excludes ${gradedCount} graded listings`;
                  setOmitHelp(omitHelp ? null : text);
                  if (!omitHelp) setTimeout(() => setOmitHelp(null), INFO_AUTO_HIDE_MS);
                }}
              >
                <LuInfo size={14} />
              </button>
              <button
                className="dr-chart-toggle"
                aria-label="Toggle trend chart"
                aria-expanded={showChart}
                aria-controls={`chart-${(itemState.query || itemState.title || 'chart').replace(/\s+/g,'-')}`}
                onClick={() => {
                  if (hideChart) {
                    try { if (onAnalyticsClick) onAnalyticsClick(itemState); } catch (e) {}
                  } else {
                    setShowChart(s => !s);
                  }
                }}
                title="Show trend"
              >
                <MdOutlineTimeline size={18} />
              </button>
            </div>
            <div className="dr-minmax">
              Min ${fmt(itemState.minPrice)} • Max ${fmt(itemState.maxPrice)}
            </div>
          </div>
        </div>
        {omitHelp && <div className="dr-omit-inline">{omitHelp}</div>}
      </div>
      </div>
      <div className={"dr-chart-panel" + (showChart ? "" : " closed")}>
        <MiniChart
          series={itemState.timeSeries || { avg: [], min: [], max: [] }}
          width={360}
          height={84}
          accent={'var(--accent)'}
        />
      </div>
    </div>
  );
}
