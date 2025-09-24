import React, { useState } from "react";
import "./resultcard.css";
import MiniChart from './MiniChart.jsx';
import { postSearchForce } from "../services/api.js";
import { formatResultTitle } from "./titleHelpers.js";
import { LuInfo } from "react-icons/lu";
import { MdOutlineTimeline } from 'react-icons/md';

// Chart rendering moved to `MiniChart.jsx` to keep ResultCard focused on layout.

export default function ResultCard({ item, isActive = false }) {
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
  // Temporary demo injection: if no timeSeries present and running in development,
  // inject a small mock series so the MiniChart renders for demos. Remove before production.
  if ((!itemState.timeSeries || !itemState.timeSeries.avg || itemState.timeSeries.avg.length === 0) && process.env.NODE_ENV !== 'production') {
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
          {itemState.platform && (
            <div className="dr-badge" title={itemState.platform}>
              {itemState.platform}{itemState.releaseYear ? ` • ${itemState.releaseYear}` : ''}
            </div>
          )}
        </div>
        <div className="dr-meta">{metaLine}</div>
        <div className="dr-meta-sub">{ts}</div>
        <div style={{ marginTop: 8 }}>
          <button
            className="dr-refresh"
            onClick={handleRefresh}
            disabled={loadingRefresh}
          >
            Refresh
          </button>
          {toast && <span className="dr-toast">{toast}</span>}
        </div>
      </div>
      <div className="dr-stats">
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}>
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
            <LuInfo size={10} />
          </button>
          <div className="dr-avg">${fmt(itemState.avgPrice)}</div>
          <button
            className="dr-chart-toggle"
            aria-label="Toggle trend chart"
            aria-expanded={showChart}
            aria-controls={`chart-${itemState.query || itemState.title || 'chart'}`}
            onClick={() => setShowChart(s => !s)}
            title="Show trend"
          >
            <MdOutlineTimeline size={18} />
          </button>
        </div>
        <div className="dr-minmax">
          Min ${fmt(itemState.minPrice)} • Max ${fmt(itemState.maxPrice)}
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
