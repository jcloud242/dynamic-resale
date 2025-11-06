import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../styles/resultcard.css";
import RechartsAnalytics from "@ui/charts/RechartsAnalytics.jsx";
import { postSearchForce } from "@services/api.js";
import { formatResultTitle, extractYear, extractPlatform } from "@lib/titleHelpers.js";
import { LuInfo } from "react-icons/lu";
import { FaChartColumn } from "react-icons/fa6";
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
  getOrCreateDefaultCollection,
  getOrCreateDefaultList,
  getCollectionById,
  getOrCreateAutoCollection,
  createUnnamedCollection,
  getListById,
} from "@services/collections.js";

// Chart rendering moved to `MiniChart.jsx` to keep ResultCard focused on layout.

export default function ResultCard({
  item,
  isActive = false,
  hideChart = false,
  onAnalyticsClick = null,
  dataKey = undefined,
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

  // Keep cards collapsed by default; user can expand to view chart
  const [showChart, setShowChart] = useState(false);
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
  const [pendingCollectionTitle, setPendingCollectionTitle] = useState("");
  const [pendingListTitle, setPendingListTitle] = useState("");
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
    // Open without auto-selecting so placeholders show until user picks
    setPickerOpen((o) => !o);
    // reset transient pending state on open
    setPendingCollectionTitle("");
    setPendingListTitle("");
    setPickerColId("");
    setPickerListId("");
  }

  function handleAddToList(e) {
    try {
      e && e.stopPropagation && e.stopPropagation();
    } catch (e) {}
  let colId = pickerColId;
  let listId = pickerListId === "__pending_list__" ? "" : pickerListId;
    // Only commit creations on Add to avoid orphaned collections/lists
    if (!colId || colId === "__pending_collection__") {
      // If user queued a collection name, create it now; otherwise use default "My Collection"
      if (pendingCollectionTitle) {
        const createdCol = createCollection({ title: pendingCollectionTitle });
        colId = createdCol && createdCol.id;
      } else {
        const autoCol = getOrCreateAutoCollection();
        colId = autoCol && autoCol.id;
      }
      // Keep placeholders; don't setPickerColId here
    }
    if (colId && !listId) {
      if (pendingListTitle) {
        const created = createList(colId, { title: pendingListTitle || 'General' });
        listId = created && created.id;
      } else {
        const defList = getOrCreateDefaultList(colId);
        listId = defList && defList.id;
      }
      // Do not setPickerListId here to keep UI consistent pre-commit
    }
    if (!colId || !listId) {
      setToast("Pick a collection and list");
      setTimeout(() => setToast(null), 1200);
      return;
    }
    const ok = addItemToList(itemState, colId, listId);
    if (ok) {
      try {
        const col = getCollectionById(colId);
        const list = getListById(colId, listId);
        const msg = `Added to ${col && col.title ? col.title : "Collection"} › ${list && list.title ? list.title : "List"}`;
        window.dispatchEvent(new CustomEvent('dr_toast', { detail: { message: msg, variant: 'info', duration: 2000 } }));
        // also notify listeners so pages like Collections can dismiss inline search results
        try {
          window.dispatchEvent(new CustomEvent('dr_item_added', { detail: { collectionId: colId, listId } }));
        } catch (e) {}
      } catch (e) {}
      setToast("Added");
      // Clear any pending state after a successful commit
      setPendingCollectionTitle("");
      setPendingListTitle("");
      setPickerColId("");
      setPickerListId("");
      setPickerOpen(false);
      // Do not navigate; user stays on current page and sees top-right toast
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
  <div className="dr-resultcard-wrap has-shadow" data-dr-key={dataKey || undefined}>
    <div className="dr-resultcard">
        <div className="dr-thumb-wrap">
          <img
            src={item.thumbnail || "/vite.svg"}
            alt="thumb"
            className="dr-thumb"
          />
        </div>
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
              const platformVal =
                (itemState && itemState.platform) ||
                extractPlatform(
                  (itemState && itemState.soldListings) || [],
                  (itemState && (itemState.title || itemState.query)) || ""
                ) || "";
              const yearFromSold = extractYear(
                (itemState && itemState.soldListings) || [],
                (itemState && (itemState.title || itemState.query)) || ""
              );
              // Fallback: also scan soldListingsRaw sample for a 4-digit year
              const yearFromRaw = extractYear(
                (itemState && itemState.soldListingsRaw) || [],
                (itemState && (itemState.title || itemState.query)) || ""
              );
              const yearVal =
                (itemState && itemState.releaseYear) ||
                yearFromSold ||
                yearFromRaw ||
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
                  className="dr-chart-toggle"
                  aria-label={hideChart ? "See Analytics" : "Toggle trend chart"}
                  title={hideChart ? "See Analytics" : "Show trend"}
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
                >
                  <FaChartColumn size={16} />
                </button>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddToList(e);
                }
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
                          // Defer creation until Add; show pending in selector
                          setPendingCollectionTitle(title);
                          setPickerColId("__pending_collection__");
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
                        let colId = pickerColId;
                        // If a pending collection is selected, defer list creation until Add
                        if (colId === "__pending_collection__") {
                          const name = prompt("New list name") || "General";
                          setPendingListTitle(name);
                          setPickerListId("__pending_list__");
                          return;
                        }
                        if (!colId) {
                          // User is explicitly creating a list without choosing a collection.
                          // Create a fresh Unnamed collection to avoid attaching to an arbitrary existing one.
                          const unnamed = createUnnamedCollection('Unnamed');
                          colId = unnamed && unnamed.id;
                          setPickerColId(colId || "");
                        }
                        if (!colId) return; // safety
                        const name = prompt("New list name") || "General";
                        const list = createList(colId, { title: name });
                        if (list) setPickerListId(list.id);
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
                    if (id === "__new_collection__") {
                      const title = prompt("New collection name");
                      if (title) {
                        // Defer creation until Add; show pending as selected
                        setPendingCollectionTitle(title);
                        setPickerColId("__pending_collection__");
                        setPickerListId("");
                      } else {
                        // reset to placeholder if user cancels
                        setPickerColId("");
                      }
                      return;
                    }
                    setPickerColId(id);
                    // Do not auto-select the first list; keep placeholder until user picks
                    setPickerListId("");
                  }}
                >
                  <option value="" disabled>
                    Select Collection
                  </option>
                  {(getCollections() || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} {(c.lists && Array.isArray(c.lists)) ? `(${c.lists.reduce((n,l)=>n + ((l.itemIds||[]).length||0),0)})` : ''}
                    </option>
                  ))}
                  {pendingCollectionTitle && pickerColId === "__pending_collection__" ? (
                    <option value="__pending_collection__">
                      {pendingCollectionTitle}
                    </option>
                  ) : null}
                  <option value="__new_collection__">+ New collection…</option>
                </select>
                <select
                  className="w-full rounded border border-border px-2 py-1 text-sm mb-2 bg-white dark:bg-neutral-900 text-foreground appearance-none"
                  value={pickerListId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id === "__new_list__") {
                      // If no collection selected, capture pending list name and defer creation until Add
                      const name = prompt("New list name") || "General";
                      if (!pickerColId || pickerColId === "__pending_collection__") {
                        setPendingListTitle(name);
                        setPickerListId("__pending_list__");
                        return;
                      }
                      // If a collection is selected, create immediately
                      const list = createList(pickerColId, { title: name });
                      if (list) setPickerListId(list.id);
                      return;
                    }
                    setPickerListId(id);
                  }}
                >
                  <option value="" disabled>
                    Select List
                  </option>
                  {(() => {
                    const sel = getCollectionById(pickerColId);
                    return ((sel && sel.lists) || []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title} {(l.itemIds && l.itemIds.length) ? `(${l.itemIds.length})` : ''}
                      </option>
                    ));
                  })()}
                  {!pickerColId && pendingListTitle ? (
                    <option value="__pending_list__">
                      {pendingListTitle}
                    </option>
                  ) : null}
                  <option value="__new_list__">+ New list…</option>
                </select>
                {(() => {
                  const sel = getCollectionById(pickerColId);
                  const hasPendingCol = !sel && pickerColId === "__pending_collection__" && !!pendingCollectionTitle;
                  // Initial state: no messaging
                  if (!pickerColId && !pendingListTitle && !pendingCollectionTitle) return null;
                  // User entered a pending list but not a collection yet
                  if (!pickerColId && pendingListTitle) {
                    return (
                      <div className="text-xs text-muted-dynamic mt-1">
                        Select a collection, or press Add to create a default collection
                      </div>
                    );
                  }
                  // User entered a pending collection but not a list yet
                  if (hasPendingCol && (!pickerListId || pickerListId === "")) {
                    return (
                      <div className="text-xs text-muted-dynamic mt-1">
                        Select a list, or press Add to create a default list
                      </div>
                    );
                  }
                  // Real collection selected with zero lists
                  if (sel && (!sel.lists || sel.lists.length === 0) && (!pickerListId || pickerListId === "")) {
                    return (
                      <div className="text-xs text-muted-dynamic mt-1">
                        Select a list, or press Add to create a default list
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="flex items-center justify-end gap-2">
                  <button
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() => {
                      setPendingCollectionTitle("");
                      setPendingListTitle("");
                      setPickerColId("");
                      setPickerListId("");
                      setPickerOpen(false);
                    }}
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
        {showChart && (
          <RechartsAnalytics
            series={itemState.timeSeries || { avg: [], min: [], max: [] }}
            height={260}
          />
        )}
      </div>
      {/* omitted info and notes */}
      {omitHelp && <div className="dr-omit-inline">{omitHelp}</div>}
    </div>
  );
}
