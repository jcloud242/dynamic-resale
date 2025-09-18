import React, { useState } from "react";
import "./resultcard.css";
import { postSearchForce } from "../services/api.js";
import { formatResultTitle } from "./titleHelpers.js";

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
          {itemState.rawCount !== undefined && (
            <div className="dr-badge">
              Showing {itemState.rawCount - (itemState.filteredCount || 0)} of{" "}
              {itemState.rawCount}
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
        <div className="dr-avg">${fmt(itemState.avgPrice)}</div>
        <div className="dr-minmax">
          Min ${fmt(itemState.minPrice)} • Max ${fmt(itemState.maxPrice)}
        </div>
        {/* compact sample size + omission note with tooltip when necessary */}
        {Array.isArray(itemState.soldListings) && itemState.soldListings.length > 0 ? (
          <div className="dr-filter-note">* based on last {itemState.soldListings.length} sold</div>
        ) : itemState.rawCount ? (
          <div className="dr-filter-note">* based on last {itemState.rawCount} listings</div>
        ) : null}

        {itemState.filteredCount > 0 && (
          <div
            className="dr-filter-note"
            title={`Filtered ${itemState.filteredCount} listings (graded or collector items omitted). Graded filtering coming soon.`}
          >
            * {itemState.filteredCount} listings omitted (eg. graded)
          </div>
        )}
      </div>
    </div>
  );
}
