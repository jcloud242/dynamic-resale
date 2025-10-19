import { useState, useEffect, useRef } from "react";
import "./home.css";
import "@styles/page.css";
import SearchBar from "@features/search/SearchBar.jsx";
import ResultList from "@features/results/ResultList.jsx";
import { FaRegSquarePlus } from "react-icons/fa6";
import { IoFilter } from "react-icons/io5";

// Simple in-memory paging for recent searches stored in localStorage
const PAGE_SIZE = 10;

export default function History({ onNavigateToAnalytics }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [sortMode, setSortMode] = useState(null); // 'title-asc', 'title-desc', 'value-asc', 'value-desc', 'category'
  const [sortOverlayOpen, setSortOverlayOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState([]); // normalized strings persisted
  const [activeTags, setActiveTags] = useState([]); // normalized strings currently applied
  const filterBtnRef = useRef(null);
  const [overlayPos, setOverlayPos] = useState(null);
  const recentRef = useRef(null);

  useEffect(() => {
    function loadRecent() {
      try {
        const raw = JSON.parse(localStorage.getItem("dr_recent") || "[]");
        setResults(raw || []);
      } catch (e) {
        setResults([]);
      }
    }
    loadRecent();
    // load persisted available tags (normalized strings)
    try {
      const t = JSON.parse(localStorage.getItem("dr_tags") || "[]");
      if (Array.isArray(t)) setAvailableTags(t.slice(0, 15));
    } catch (e) {}
    // activeTags intentionally start empty on fresh load
    setActiveTags([]);
    // listen for updates from Home and cross-tab storage changes
    function onRecentChanged() {
      loadRecent();
    }
    function onStorage(ev) {
      if (ev && ev.key === "dr_recent") loadRecent();
    }
    window.addEventListener("dr_recent_changed", onRecentChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("dr_recent_changed", onRecentChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function normalizeTag(s) {
    if (!s) return "";
    // trim, lowercase, remove punctuation except spaces, collapse whitespace
    // normalize unicode (remove accents), lowercase, strip punctuation, collapse whitespace
    let t = String(s).trim().toLowerCase();
    try {
      t = t.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
    } catch (e) {
      /* ignore on older runtimes */
    }
  t = t.replace(/[^\p{L}\p{N}\s]+/gu, "");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }
  // searchLocal optionally takes a tagsOverride array to avoid async state races
  function searchLocal(q, tagsOverride) {
    setQuery(q || "");
    const useTags = Array.isArray(tagsOverride) ? tagsOverride : activeTags;
    // always start from the full stored recent history to avoid cumulative filtering
    let arr = (
      JSON.parse(localStorage.getItem("dr_recent") || "[]") || []
    ).slice();
    if (q && q.trim()) {
      const term = q.toLowerCase().trim();
      arr = arr.filter(
        (i) =>
          i &&
          ((i.title || i.query || "").toLowerCase().includes(term) ||
            (i.query || "").toLowerCase().includes(term))
      );
    }
    // apply active tags as filters (future: tag structured queries)
    if (useTags && useTags.length) {
      for (const t of useTags) {
        const normVal = normalizeTag(t || "");
        if (!normVal) continue;
        arr = arr.filter((i) => {
          if (!i) return false;
          const title = normalizeTag(i.title || i.query || "");
          if (title.includes(normVal)) return true;
          const cat = normalizeTag(i.category || i.platform || "");
          if (cat.includes(normVal)) return true;
          return false;
        });
      }
    }
    // apply sort
    if (sortMode) {
      arr.sort((a, b) => {
        if (sortMode.startsWith("title")) {
          const av = ((a && (a.title || a.query)) || "").toLowerCase();
          const bv = ((b && (b.title || b.query)) || "").toLowerCase();
          if (av < bv) return sortMode.endsWith("asc") ? -1 : 1;
          if (av > bv) return sortMode.endsWith("asc") ? 1 : -1;
          return 0;
        }
        if (sortMode.startsWith("value")) {
          const av = Number((a && (a.avgPrice || 0)) || 0);
          const bv = Number((b && (b.avgPrice || 0)) || 0);
          return sortMode.endsWith("asc") ? av - bv : bv - av;
        }
        if (sortMode === "category") {
          const av = ((a && (a.category || "")) || "").toLowerCase();
          const bv = ((b && (b.category || "")) || "").toLowerCase();
          if (av < bv) return -1;
          if (av > bv) return 1;
          return 0;
        }
        return 0;
      });
    }
    setResults(arr || []);
    setPage(1);
  }

  function toggleTag(label) {
    const norm = normalizeTag(label);
    if (!norm) return;
    const isActive = activeTags.includes(norm);
    let nextActive;
    if (isActive) nextActive = activeTags.filter((t) => t !== norm);
    else nextActive = [norm, ...activeTags.filter((t) => t !== norm)];
    setActiveTags(nextActive);
    // ensure availableTags contains the tag
    if (!availableTags.includes(norm)) {
      const nextAvailable = [
        norm,
        ...availableTags.filter((t) => t !== norm),
      ].slice(0, 15);
      setAvailableTags(nextAvailable);
      try {
        localStorage.setItem("dr_tags", JSON.stringify(nextAvailable));
      } catch (e) {}
    }
    // re-run search with updated active tags
    searchLocal(query, nextActive);
  }

  function addTagFromInput(value) {
    if (!value || !value.trim()) return;
    const norm = normalizeTag(value);
    if (!norm) return;
    if (!availableTags.includes(norm)) {
      const nextAvailable = [norm, ...availableTags].slice(0, 15);
      setAvailableTags(nextAvailable);
      try {
        localStorage.setItem("dr_tags", JSON.stringify(nextAvailable));
      } catch (e) {}
    }
    // also activate the tag when added
    if (!activeTags.includes(norm)) {
      const nextActive = [norm, ...activeTags].slice(0, 15);
      setActiveTags(nextActive);
      searchLocal(query, nextActive);
    } else {
      // if already active just ensure search reflects current activeTags
      searchLocal(query, activeTags);
    }
  }

  const totalPages = Math.max(
    1,
    Math.ceil((results && results.length) / PAGE_SIZE)
  );
  const pageItems = (results || []).slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // compute seed tags and combined tag list defensively to avoid runtime errors
  let seed = [];
  try {
    const counts = {};
    // derive seed from the full persisted recent history so tags remain visible
    const full = (
      JSON.parse(localStorage.getItem("dr_recent") || "[]") || []
    ).slice();
    for (const r of full || []) {
      const cat = ((r && (r.category || r.platform || "")) || "").trim();
      if (!cat) continue;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const sorted = Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 8);
    seed = sorted.slice();
  } catch (e) {
    seed = [];
  }

  // combine availableTags and seed, dedupe by normalized key
  const combined = [];
  try {
    const combinedKeys = {};
    for (const s of [...seed, ...(availableTags || [])]) {
      const k = normalizeTag(s);
      if (!k) continue;
      if (combinedKeys[k]) continue;
      combinedKeys[k] = true;
      combined.push({
        raw: s,
        norm: k,
        display: seed.includes(s)
          ? s
          : String(s)
              .split(" ")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
        active: (activeTags || []).includes(k),
      });
    }
  } catch (e) {
    // fallback
  }

  return (
  <main className="dr-page dr-history">
      {/* header intentionally removed: SearchBar shows context */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          {/* reuse SearchBar UI but hide scan/photo icons on history */}
          <SearchBar
            onSearch={(p) => {
              const q = typeof p === "object" ? p.query || "" : p;
              searchLocal(q);
            }}
            onOpenCamera={() => {}}
            onOpenImage={() => {}}
            showScans={false}
            placeholder="Search History"
          />
        </div>
        {/* right side: filter icon only (SearchBar has its own submit button) */}
        <button
          ref={filterBtnRef}
          className="dr-filter-btn dr-icon-btn"
          aria-label="Sort/Filter"
          onClick={(e) => {
            const rect =
              filterBtnRef.current &&
              filterBtnRef.current.getBoundingClientRect();
            setOverlayPos(
              rect
                ? {
                    top: rect.bottom + window.scrollY + 8,
                    left: rect.left + window.scrollX,
                  }
                : null
            );
            setSortOverlayOpen((s) => !s);
          }}
          title="Filter"
        >
          <span className="dr-icon-inner">
            <IoFilter size={20} />
          </span>
        </button>
      </div>

      {/* Tag row: simple pill tags derived from recent results top categories/platforms */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        {combined.map((tObj, i) => {
          const display = tObj.display || tObj.raw || tObj.norm;
          const active = (activeTags || []).includes(tObj.norm);
          return (
            <div key={i} className={`dr-history-tag ${active ? "active" : ""}`}>
              <button
                className="dr-history-tag-btn"
                onClick={() => toggleTag(tObj.raw || tObj.norm)}
              >
                <span className="dr-history-tag-label">{display}</span>
                {active && (
                  <span
                    className="dr-history-tag-x"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTag(tObj.raw || tObj.norm);
                    }}
                    aria-label={`Remove ${display}`}
                  >
                    ×
                  </span>
                )}
              </button>
            </div>
          );
        })}
        {/* tag adder: plus icon reveals small input */}
        <TagInput onAdd={(v) => addTagFromInput(v)} />
      </div>

      {/* Sort overlay */}
      {sortOverlayOpen && (
        <div className="dr-overlay" onClick={() => setSortOverlayOpen(false)}>
          <div
            className="dr-overlay-panel"
            style={
              overlayPos
                ? {
                    position: "fixed",
                    left: overlayPos.left + "px",
                    top: overlayPos.top + "px",
                  }
                : {}
            }
            onClick={(e) => e.stopPropagation()}
          >
            <h4>Filter by</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => {
                  setSortMode("title");
                  setSortOverlayOpen(false);
                  searchLocal(query);
                }}
              >
                Title
              </button>
              <button
                onClick={() => {
                  setSortMode("category");
                  setSortOverlayOpen(false);
                  searchLocal(query);
                }}
              >
                Category
              </button>
              <button
                onClick={() => {
                  setSortMode("value");
                  setSortOverlayOpen(false);
                  searchLocal(query);
                }}
              >
                Value
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results list (hideChart true for history view). Provide analytics handler to navigate to analytics page */}
      <div
        ref={recentRef}
        className="dr-recent-wrapper"
        style={{ marginTop: 8 }}
      >
        <ResultList
          items={pageItems}
          active={false}
          hideChart={true}
          onAnalyticsClick={(it) => {
            try {
              if (onNavigateToAnalytics) onNavigateToAnalytics(it);
            } catch (e) {}
          }}
        />
      </div>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 12,
        }}
      >
        <div className="dr-pagination">
          <button
            aria-label="Previous"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="chev"
          >
            ❮
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(
            (n) => (
              <button
                key={n}
                className={`page-num ${n === page ? "active" : ""}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            )
          )}
          <button
            aria-label="Next"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="chev"
          >
            ❯
          </button>
        </div>
      </div>
    </main>
  );
}

function TagInput({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  return (
    <div className="dr-tag-adder">
      <button
        className="dr-tag-plus"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add tag"
      >
        <FaRegSquarePlus size={20} />
      </button>
      {open && (
        <div style={{ display: "flex", alignItems: "center" }}>
          <input
            autoFocus
            placeholder="Add new tag"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (val && val.trim()) {
                  onAdd(val.trim());
                  setVal("");
                  setOpen(false);
                }
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
