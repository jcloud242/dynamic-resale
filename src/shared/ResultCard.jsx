import React, { useState } from "react";
import "./resultcard.css";
import { postSearchForce } from "../services/api.js";
import { formatResultTitle } from "./titleHelpers.js";
import { LuInfo } from "react-icons/lu";

export default function ResultCard({ item }) {
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
  return (
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
              const soldCount = Array.isArray(itemState.soldListings) && itemState.soldListings.length ? itemState.soldListings.length : (itemState.sampleSize || 0);
              const gradedCount = (itemState.filteredBreakdown && itemState.filteredBreakdown.graded) || (itemState.gradedOmitted || 0);
              const n = soldCount || 10;
              let text = `*Average price based on the last ${n} sold`;
              if (gradedCount > 0) text += ` (Excludes ${gradedCount} graded listings)`;
              // fallback note when we couldn't reach desired sample size
              if ((itemState.sampleSize || 0) > 0 && (itemState.sampleSize || 0) < 10) {
                text += ` — only ${itemState.sampleSize} available`;
              }
              setOmitHelp(omitHelp ? null : text);
              if (!omitHelp) setTimeout(() => setOmitHelp(null), INFO_AUTO_HIDE_MS);
            }}
          >
            <LuInfo size={10} />
          </button>
          <div className="dr-avg">${fmt(itemState.avgPrice)}</div>
        </div>
        <div className="dr-minmax">
          Min ${fmt(itemState.minPrice)} • Max ${fmt(itemState.maxPrice)}
        </div>
        {omitHelp && <div className="dr-omit-inline">{omitHelp}</div>}
      </div>
    </div>
  );
}
