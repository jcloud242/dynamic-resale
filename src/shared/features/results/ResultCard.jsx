import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../styles/resultcard.css";
import MiniChart from "@ui/charts/MiniChart.jsx";
import { postSearchForce } from "@services/api.js";
import { formatResultTitle, extractYear } from "@lib/titleHelpers.js";
import { LuInfo } from "react-icons/lu";
import {
  MdOutlineTimeline,
  MdHistory,
  MdPlaylistAdd,
  MdAdd,
  MdCreateNewFolder,
} from "react-icons/md";
import {
  getCollections,
  addItemToList,
  getAllMemberships,
  createCollection,
  createList,
} from "@services/collections.js";

// Chart rendering moved to `MiniChart.jsx` to keep ResultCard focused on layout.

export default function ResultCard({
  item,
  isActive = false,
  hideChart = false,
  onAnalyticsClick = null,
}) {
  const [itemState, setItemState] = useState(item || null);
  // keep local state in sync when parent `item` prop changes
  useEffect(() => {
    setItemState(item || null);
  }, [item]);
  const fmt = (v) =>
    v === null || v === undefined ? "-" : Number(v).toFixed(2);
  const ts =
    itemState && itemState.fetchedAt
      ? new Date(itemState.fetchedAt).toLocaleString()
      : null;
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [toast, setToast] = useState(null);
  const [omitHelp, setOmitHelp] = useState(null);
  // demo mode: enable when local dev or when URL has ?demo=1 so you can test charts
  const demoEnabled =
    (typeof window !== "undefined" &&
      window.location &&
      window.location.search &&
      window.location.search.indexOf("demo=1") !== -1) ||
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.DEV);

  // Keep recent cards closed by default. Only open chart when item isActive
  const [showChart, setShowChart] = useState(Boolean(isActive));
  useEffect(() => {
    if (isActive) setShowChart(true);
  }, [isActive]);
  const INFO_AUTO_HIDE_MS = 3000;

  async function handleRefresh() {
    const query = itemState && (itemState.query || itemState.upc);
    if (!query) return;
    setLoadingRefresh(true);
    setToast("Refreshing...");
    try {
      const res = await postSearchForce(query);
      // replace local state so UI updates immediately
      setItemState(Object.assign({}, itemState || {}, res));
      setToast("Refreshed");
    } catch (e) {
      setToast("Refresh failed");
    } finally {
      setLoadingRefresh(false);
      setTimeout(() => setToast(null), 1500);
    }
  }
  // Add-to-list popover state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerColId, setPickerColId] = useState("");
  const [pickerListId, setPickerListId] = useState("");
  const pickerRef = useRef(null);
  const addIconRef = useRef(null);
  const [popoverPos, setPopoverPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    function onDoc(e) {
      try {
        if (pickerRef.current && pickerRef.current.contains(e.target)) return;
      } catch (e) {}
      setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const pop = pickerRef.current;
    function positionPopover() {
      try {
        const icon = addIconRef.current;
        if (!icon) return;
        const rect = icon.getBoundingClientRect();
        // Start right of the icon
        let left = rect.right + 8;
        let top = rect.top - 4;
        // If we can measure the popover, apply viewport-aware flips
        if (pop) {
          const pr = pop.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          if (left + pr.width > vw - 8) {
            left = rect.left - pr.width - 8;
          }
          if (left < 8) left = 8;
          if (top + pr.height > vh - 8) {
            top = Math.max(8, rect.bottom - pr.height - 8);
          }
          if (top < 8) top = 8;
        }
        setPopoverPos({ left, top });
      } catch (e) {}
    }
    // initial and next frame to account for mount/measures
    positionPopover();
    const id = requestAnimationFrame(positionPopover);
    function onScroll() {
      positionPopover();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pickerOpen]);

  function handleOpenPicker(e) {
    try {
      e && e.stopPropagation && e.stopPropagation();
    } catch (e) {}
    // Compute initial position before opening
    try {
      const icon = addIconRef.current;
      if (icon) {
        const rect = icon.getBoundingClientRect();
        setPopoverPos({ left: rect.right + 8, top: rect.top - 4 });
      }
    } catch (e) {}
    setPickerOpen((o) => !o);
    const cols = getCollections();
    if (cols.length && !pickerColId) {
      setPickerColId(cols[0].id);
      const firstList = (cols[0].lists || [])[0];
      setPickerListId(firstList ? firstList.id : "");
    }
  }

  function handleAddToList(e) {
    try {
      e && e.stopPropagation && e.stopPropagation();
    } catch (e) {}
    if (!pickerColId || !pickerListId) {
      setToast("Pick a collection and list");
      setTimeout(() => setToast(null), 1200);
      return;
    }
    const ok = addItemToList(itemState, pickerColId, pickerListId);
    if (ok) {
      setToast("Added");
      setPickerOpen(false);
    } else {
      setToast("Failed");
    }
    setTimeout(() => setToast(null), 1200);
  }
  const { displayTitle, meta } = formatResultTitle(itemState || {});
  const metaLine = meta;
  // compute omitted count defensively (supports cached responses)
  const rawLen =
    (itemState &&
      Array.isArray(itemState.soldListingsRaw) &&
      itemState.soldListingsRaw.length) ||
    (itemState && itemState.rawCount) ||
    0;
  const shownLen =
    (itemState &&
      Array.isArray(itemState.soldListings) &&
      itemState.soldListings.length) ||
    0;
  const omittedCount =
    typeof itemState.filteredCount === "number"
      ? itemState.filteredCount
      : Math.max(0, rawLen - shownLen);
  // Temporary demo injection: if no timeSeries present and running in development or demo mode,
  // inject a small mock series so the MiniChart renders for demos. Controlled by ?demo=1 or NODE_ENV.
  if (
    itemState &&
    (!itemState.timeSeries ||
      !itemState.timeSeries.avg ||
      itemState.timeSeries.avg.length === 0) &&
    demoEnabled
  ) {
    // create a simple 12-point series with slight variation around avgPrice
    try {
      const base =
        (itemState && itemState.avgPrice && Number(itemState.avgPrice)) || 20;
      const fake = { avg: [], min: [], max: [] };
      for (let i = 0; i < 12; i++) {
        const v = Math.max(
          1,
          Math.round(
            (base + Math.sin(i / 2) * 3 + (Math.random() * 2 - 1)) * 100
          ) / 100
        );
        fake.avg.push({ t: Date.now() - (11 - i) * 24 * 3600 * 1000, v });
        fake.min.push({
          t: Date.now() - (11 - i) * 24 * 3600 * 1000,
          v: Math.max(1, v - (Math.random() * 4 + 1)),
        });
        fake.max.push({
          t: Date.now() - (11 - i) * 24 * 3600 * 1000,
          v: v + (Math.random() * 4 + 1),
        });
      }
      itemState.timeSeries = fake;
    } catch (e) {}
  }

  if (!itemState) return null;

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
          <div
            className="dr-meta"
            style={{
              marginTop: 4,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {/* value-only badges: [Nintendo Switch] [2021] */}
            {(() => {
              const platformVal = (itemState && itemState.platform) || "";
              const yearVal =
                (itemState &&
                  (itemState.releaseYear ||
                    extractYear(
                      itemState.soldListings || [],
                      itemState.title || ""
                    ))) ||
                "";
              const vals = [platformVal, yearVal].filter(Boolean);
              return vals.map((v, i) => (
                <span key={i} className="dr-flat-badge">
                  {v}
                </span>
              ));
            })()}
          </div>
          <div
            className="dr-meta-sub"
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <button
              className="dr-refresh-inline"
              aria-label="Refresh"
              onClick={handleRefresh}
              disabled={loadingRefresh}
              title="Refresh"
            >
              <MdHistory size={16} />
              <span className="dr-refresh-ts">
                {ts}
                <span
                  ref={addIconRef}
                  className="dr-playlist-inline"
                  title="Add to list"
                  onClick={handleOpenPicker}
                  style={{ position: "relative", display: "inline-block" }}
                >
                  <MdPlaylistAdd size={16} />
                </span>
              </span>
            </button>
            {toast && <span className="dr-toast">{toast}</span>}
          </div>
        </div>
        <div className="dr-stats">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <div className="dr-stats-inner">
              <div className="dr-avg-row">
                <div className="dr-avg">${fmt(itemState.avgPrice)}</div>
                <button
                  className="dr-avg-info"
                  aria-label="Show price info"
                  onClick={() => {
                    const used =
                      typeof itemState.sampleSize === "number" &&
                      itemState.sampleSize >= 0
                        ? itemState.sampleSize
                        : Array.isArray(itemState.soldListings)
                        ? itemState.soldListings.length
                        : 0;
                    const raw =
                      typeof itemState.rawCount === "number" &&
                      itemState.rawCount >= 0
                        ? itemState.rawCount
                        : Array.isArray(itemState.soldListingsRaw)
                        ? itemState.soldListingsRaw.length
                        : 0;
                    const gradedCount =
                      (itemState.filteredBreakdown &&
                        itemState.filteredBreakdown.graded) ||
                      itemState.gradedOmitted ||
                      0;
                    let text = "";
                    if (used > 0) {
                      if (raw && raw > used) {
                        text = `*Average price based on ${used} sold`;
                      } else {
                        text = `*Average price based on ${used} sold`;
                      }
                    } else {
                      text =
                        "*Average price could not be computed (no usable sold listings)";
                    }
                    if (gradedCount > 0)
                      text += ` — excludes ${gradedCount} graded listings`;
                    setOmitHelp(omitHelp ? null : text);
                    if (!omitHelp)
                      setTimeout(() => setOmitHelp(null), INFO_AUTO_HIDE_MS);
                  }}
                >
                  <LuInfo size={14} />
                </button>
                <button
                  className="dr-chart-toggle"
                  aria-label="Toggle trend chart"
                  aria-expanded={showChart}
                  aria-controls={`chart-${(
                    itemState.query ||
                    itemState.title ||
                    "chart"
                  ).replace(/\s+/g, "-")}`}
                  onClick={() => {
                    if (hideChart) {
                      try {
                        if (onAnalyticsClick) onAnalyticsClick(itemState);
                      } catch (e) {}
                    } else {
                      setShowChart((s) => !s);
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
        </div>
      </div>
      {/* Add-to-list popover is rendered inline next to the icon above */}
      {/* Add-to-list popover is rendered via a body-level portal to avoid stacking/jitter */}
      {pickerOpen &&
        createPortal(
          (
            <div
              ref={pickerRef}
              className="dr-popover"
              style={{
                position: "fixed",
                zIndex: 10000,
                left: popoverPos.left,
                top: popoverPos.top,
              }}
              onClick={(e) => {
                try {
                  e.stopPropagation();
                } catch (e) {}
              }}
              onMouseDown={(e) => {
                try {
                  e.stopPropagation();
                } catch (e) {}
              }}
              onTouchStart={(e) => {
                try {
                  e.stopPropagation();
                } catch (e) {}
              }}
            >
              <div className="rounded-md border border-border bg-white dark:bg-neutral-900 shadow-lg p-2 min-w-[240px]">
                <div
                  className="text-xs text-muted-dynamic mb-1"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>Save to list</span>
                  <div className="inline-flex items-center gap-1">
                    <button
                      className="rounded border px-1 py-1"
                      title="New collection"
                      onClick={(e) => {
                        e.preventDefault();
                        const title = prompt("New collection name");
                        if (title) {
                          const col = createCollection({ title });
                          setPickerColId(col.id);
                          setPickerListId("");
                        }
                      }}
                    >
                      <MdCreateNewFolder size={16} />
                    </button>
                    <button
                      className="rounded border px-1 py-1"
                      title="New list"
                      onClick={(e) => {
                        e.preventDefault();
                        const cols = getCollections();
                        const sel = cols.find((c) => c.id === pickerColId);
                        if (!sel) {
                          setToast("Pick a collection");
                          setTimeout(() => setToast(null), 1100);
                          return;
                        }
                        const name = prompt("New list name");
                        if (name) {
                          const list = createList(pickerColId, { title: name });
                          if (list) setPickerListId(list.id);
                        }
                      }}
                    >
                      <MdAdd size={16} />
                    </button>
                  </div>
                </div>
                <select
                  className="w-full rounded border border-border px-2 py-1 text-sm mb-2 bg-white dark:bg-neutral-900 text-foreground appearance-none"
                  value={pickerColId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPickerColId(id);
                    const sel = (getCollections() || []).find(
                      (c) => c.id === id
                    );
                    setPickerListId(
                      (sel && sel.lists && sel.lists[0] && sel.lists[0].id) ||
                        ""
                    );
                  }}
                >
                  {(getCollections() || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded border border-border px-2 py-1 text-sm mb-2 bg-white dark:bg-neutral-900 text-foreground appearance-none"
                  value={pickerListId}
                  onChange={(e) => setPickerListId(e.target.value)}
                >
                  {(() => {
                    const sel = (getCollections() || []).find(
                      (c) => c.id === pickerColId
                    );
                    return ((sel && sel.lists) || []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ));
                  })()}
                </select>
                <div className="flex items-center justify-end gap-2">
                  <button
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() => setPickerOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded border px-2 py-1 text-sm"
                    onClick={handleAddToList}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          ),
          document.body
        )}

      {/* chart drop-down below */}
      <div
        className={`dr-chart-panel ${showChart ? "" : "closed"}`}
        id={`chart-${(itemState.query || itemState.title || "chart").replace(
          /\s+/g,
          "-"
        )}`}
      >
        <MiniChart
          series={itemState.timeSeries || { avg: [], min: [], max: [] }}
          width={380}
          height={84}
        />
      </div>
      {/* omitted info and notes */}
      {omitHelp && <div className="dr-omit-inline">{omitHelp}</div>}
    </div>
  );
}
