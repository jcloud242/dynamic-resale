import { useEffect, useMemo, useRef, useState } from "react";
import ResultCard from "@features/results/ResultCard.jsx";
import SearchHeader from "@features/search/SearchHeader.jsx";
import { MdFolderCopy, MdPlaylistAdd, MdDelete, MdEdit, MdSave, MdClose, MdDragHandle } from "react-icons/md";
import { FaRegSquarePlus } from "react-icons/fa6";
import {
  getCollections,
  saveCollections,
  createCollection,
  renameCollection,
  deleteCollection,
  createList,
  renameList,
  deleteList,
  reorderLists,
  getItems,
  getItemKey,
  upsertItem,
  addItemToList,
  removeItemFromList,
  getOrCreateDefaultList,
} from "@services/collections.js";
import { postSearch } from "@services/api.js";
import { formatResultTitle, extractYear, extractPlatform } from "@lib/titleHelpers.js";
import "./collections.css";
import "@styles/resultcard.css";
import "@styles/page.css";

// Lightweight mock data to demonstrate the Collections UX
const MOCK_RESULTS = [
  {
    id: "r1",
    query: "The Legend of Zelda: TOTK",
    title: "The Legend of Zelda: Tears of the Kingdom - Switch",
    thumbnail: "/vite.svg",
    avgPrice: 49.99,
    minPrice: 35,
    maxPrice: 65,
    soldListings: [],
    timeSeries: { avg: [], min: [], max: [] },
    fetchedAt: new Date().toISOString(),
  },
  {
    id: "r2",
    query: "Mario Kart 8 Deluxe",
    title: "Mario Kart 8 Deluxe - Switch",
    thumbnail: "/vite.svg",
    avgPrice: 39.99,
    minPrice: 25,
    maxPrice: 55,
    soldListings: [],
    timeSeries: { avg: [], min: [], max: [] },
    fetchedAt: new Date().toISOString(),
  },
  {
    id: "r3",
    query: "Elden Ring PS5",
    title: "Elden Ring - PS5",
    thumbnail: "/vite.svg",
    avgPrice: 29.0,
    minPrice: 20,
    maxPrice: 45,
    soldListings: [],
    timeSeries: { avg: [], min: [], max: [] },
    fetchedAt: new Date().toISOString(),
  },
];

// Default structure without groups – collections are a flat array (used when storage empty)
const DEFAULT_COLLECTIONS = [];

function lookupById(id) {
  return MOCK_RESULTS.find((r) => r.id === id) || null;
}

export default function Collections({ onNavigateToAnalytics = null }) {
  // Flat collections state (no groups for now)
  const [collections, setCollections] = useState(() => {
    const saved = getCollections();
    return saved && saved.length ? saved : DEFAULT_COLLECTIONS;
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // { collectionId }
  // Add-collection panel state (modern compact styling)
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addTags, setAddTags] = useState([]); // array of strings
  const [tagInput, setTagInput] = useState("");
  const addAnchorRef = useRef(null);
  // inline edit state
  const [editingCollectionId, setEditingCollectionId] = useState(null);
  const [editingCollectionTitle, setEditingCollectionTitle] = useState("");
  const [editingListId, setEditingListId] = useState(null);
  const [editingListTitle, setEditingListTitle] = useState("");
  // inline search result (temporary) and status
  const [activeResult, setActiveResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  // expanded collection tag editor state
  const [editTagsOpen, setEditTagsOpen] = useState(false);
  const [editTagInput, setEditTagInput] = useState("");
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalValue, setTagModalValue] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState([]);
  // Active filter tags for the currently opened collection
  const [activeFilterTags, setActiveFilterTags] = useState([]);
  const listRefs = useRef({});
  // expose item DOM lookup for focus-scroll
  const itemRefs = useRef({});

  useEffect(() => {
    saveCollections(collections);
  }, [collections]);


  // listen to external changes (e.g., from ResultCard add-to-list)
  useEffect(() => {
    function onChange() {
      setCollections(getCollections());
    }
    window.addEventListener("dr_collections_changed", onChange);
    window.addEventListener("dr_items_changed", onChange);
    // when an item is added from the inline search result, remove it from the temporary area
    function onItemAdded() {
      setActiveResult(null);
    }
    window.addEventListener("dr_item_added", onItemAdded);
    return () => {
      window.removeEventListener("dr_collections_changed", onChange);
      window.removeEventListener("dr_items_changed", onChange);
      window.removeEventListener("dr_item_added", onItemAdded);
    };
  }, []);

  // Close popover on click-away and Escape
  useEffect(() => {
    if (!addOpen) return;
    function onDocClick(e) {
      try {
        const el = addAnchorRef.current;
        if (el && el.contains(e.target)) return; // inside anchor/popover
        setAddOpen(false);
      } catch (err) {}
    }
    function onDocKey(e) {
      if (e.key === "Escape") setAddOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick, { passive: true });
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [addOpen]);

  function resolveItemByKey(key) {
    // First check persisted items store
    const all = getItems();
    if (all && all[key]) return all[key];
    // Fallback: scan recent history for a matching key and heal the store
    try {
      const recent = JSON.parse(localStorage.getItem("dr_recent") || "[]") || [];
      for (const it of recent) {
        const k = getItemKey(it);
        if (k && k === key) {
          upsertItem(it); // persist for future fast resolution
          return it;
        }
      }
    } catch (e) {}
    // Last resort: mock lookup (dev only)
    return lookupById(key);
  }

  function computeListTotal(itemIds = []) {
    return (itemIds || []).reduce((sum, key) => {
      const it = resolveItemByKey(key);
      const v = it && it.avgPrice != null ? Number(it.avgPrice) : 0;
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
  }

  function computeCollectionTotal(collection) {
    if (!collection || !Array.isArray(collection.lists)) return 0;
    return collection.lists.reduce(
      (s, l) => s + computeListTotal(l.itemIds),
      0
    );
  }

  // persist a recent entry and notify listeners (History/Home)
  function saveRecent(res) {
    if (!res) return;
    try {
      const key = (res && (res.query || res.upc || res.title)) || "";
      // Store slim entry only to avoid localStorage quota errors
      const entry = {
        query: res.query || res.upc || key,
        title: res.title || res.query || key,
        upc: res.upc || null,
        thumbnail: res.thumbnail || "/vite.svg",
        avgPrice: res.avgPrice ?? null,
        minPrice: res.minPrice ?? null,
        maxPrice: res.maxPrice ?? null,
        category: res.category || res.platform || null,
        platform: res.platform || extractPlatform(res.soldListings || [], res.title || res.query || "") || null,
        releaseYear: res.releaseYear || extractYear(res.soldListings || [], res.title || res.query || "") || null,
        fetchedAt: res.fetchedAt || new Date().toISOString(),
      };
      const r = JSON.parse(localStorage.getItem("dr_recent") || "[]");
      const idx = r.findIndex((it) => it && (it.query === key || it.upc === key || it.title === key));
      if (idx !== -1) {
        r.splice(idx, 1);
        r.unshift(entry);
      } else {
        r.unshift(entry);
      }
      localStorage.setItem("dr_recent", JSON.stringify(r.slice(0, 10)));
      try { window.dispatchEvent(new CustomEvent("dr_recent_changed")); } catch (e) {}
    } catch (e) {}
  }

  // create via popover form
  function handleCreateCollection(e) {
    if (e && e.preventDefault) e.preventDefault();
    const title = (addName || "").trim();
    if (!title) return;
    const col = createCollection({ title, tags: addTags });
    setCollections(getCollections());
    setAddOpen(false);
    setAddName("");
    setAddTags([]);
    setTagInput("");
    setSelected({ collectionId: col.id });
  }

  function addList(collectionId) {
    const name = prompt("New list title");
    if (!name) return;
    createList(collectionId, { title: name });
    setCollections(getCollections());
  }
  function addTagToCollection(collectionId, tag) {
    const tagVal = (tag || "").trim();
    if (!tagVal) return;
    const arr = getCollections();
    const col = arr.find((c) => c.id === collectionId);
    if (!col) return;
    col.tags = Array.isArray(col.tags) ? col.tags.slice() : [];
    if (!col.tags.includes(tagVal)) col.tags.push(tagVal);
    saveCollections(arr);
    setCollections(arr);
  }
  function removeTagFromCollection(collectionId, tag) {
    const arr = getCollections();
    const col = arr.find((c) => c.id === collectionId);
    if (!col) return;
    col.tags = (col.tags || []).filter((t) => t !== tag);
    saveCollections(arr);
    setCollections(arr);
  }

  function openCollection(collectionId) {
    setSelected({ collectionId });
    setActiveFilterTags([]); // reset filters on open
  }

  function closeCollection() {
    setSelected(null);
  }

  // add tag helpers
  function handleAddTagSubmit() {
    const v = (tagInput || "").trim();
    if (!v) return;
    if (!addTags.includes(v)) setAddTags((arr) => [...arr, v]);
    setTagInput("");
  }

  function removeAddTag(v) {
    setAddTags((arr) => arr.filter((t) => t !== v));
  }

  // inline edit/delete handlers
  function startEditCollection(col) {
    setEditingCollectionId(col.id);
    setEditingCollectionTitle(col.title || "");
  }
  function saveEditCollection() {
    const title = (editingCollectionTitle || "").trim();
    if (!title) {
      setEditingCollectionId(null);
      return;
    }
    renameCollection(editingCollectionId, title);
    setCollections(getCollections());
    setEditingCollectionId(null);
  }
  function removeCollection(collectionId) {
    if (!confirm("Delete this collection?")) return;
    setCollections((prev) => {
      const next = (prev || []).filter((c) => c.id !== collectionId);
      saveCollections(next);
      return next;
    });
    if (selected && selected.collectionId === collectionId) setSelected(null);
    try {
      window.dispatchEvent(
        new CustomEvent("dr_toast", {
          detail: { message: "Collection deleted", variant: "info", duration: 1400 },
        })
      );
    } catch (e) {}
  }
  function startEditList(list) {
    setEditingListId(list.id);
    setEditingListTitle(list.title || "");
  }
  function saveEditList(colId) {
    const title = (editingListTitle || "").trim();
    if (!title) {
      setEditingListId(null);
      return;
    }
    renameList(colId, editingListId, title);
    setCollections(getCollections());
    setEditingListId(null);
  }
  function removeList(colId, listId) {
    if (!confirm("Delete this list?")) return;
    deleteList(colId, listId);
    setCollections(getCollections());
  }

  // basic drag reorder handlers (mouse only for now)
  const dragState = useRef({ from: null });
  function onDragStartList(e, listId) {
    dragState.current.from = listId;
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOverList(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDropList(e, targetListId, colId) {
    e.preventDefault();
    // support two modes: list reordering (existing behavior) and item drop into this list
    const dataItemKey = e.dataTransfer.getData('text/dr-itemkey');
    const dataItemJson = e.dataTransfer.getData('application/json');
    if (dataItemKey || dataItemJson) {
      // Item move/add flow
      try {
        const fromMeta = JSON.parse(e.dataTransfer.getData('text/dr-from') || '{}');
        if (dataItemKey) {
          // move an existing item by key
          const item = resolveItemByKey(dataItemKey);
          if (fromMeta.fromColId && fromMeta.fromListId) {
            removeItemFromList(dataItemKey, fromMeta.fromColId, fromMeta.fromListId);
          }
          addItemToList(item, colId, targetListId);
          setCollections(getCollections());
          window.dispatchEvent(new CustomEvent('dr_toast', { detail: { message: 'Moved item', variant: 'info', duration: 1200 } }));
          return;
        }
        if (dataItemJson) {
          // add a brand new item payload into this list
          const parsed = JSON.parse(dataItemJson);
          if (parsed && parsed.item) {
            addItemToList(parsed.item, colId, targetListId);
            setCollections(getCollections());
            setActiveResult(null);
            window.dispatchEvent(new CustomEvent('dr_toast', { detail: { message: 'Added to list', variant: 'info', duration: 1200 } }));
            return;
          }
        }
      } catch (err) {}
      return;
    }
    // Fallback: list reordering
    const fromId = dragState.current.from;
    if (!fromId || fromId === targetListId) return;
    const col = (getCollections() || []).find((c) => c.id === colId);
    if (!col) return;
    const ids = (col.lists || []).map((l) => l.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(targetListId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
    reorderLists(colId, ids);
    setCollections(getCollections());
  }

  function onDragStartItem(e, itemKey, fromColId, fromListId) {
    try {
      e.dataTransfer.setData('text/dr-itemkey', itemKey);
      e.dataTransfer.setData('text/dr-from', JSON.stringify({ fromColId, fromListId }));
      e.dataTransfer.effectAllowed = 'move';
    } catch (err) {}
  }
  function onDragStartInlineItem(e, item) {
    try {
      e.dataTransfer.setData('application/json', JSON.stringify({ item }));
      e.dataTransfer.effectAllowed = 'copyMove';
    } catch (err) {}
  }
  function onDragOverAllow(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function onDropToCollection(e, targetColId) {
    e.preventDefault();
    const dataItemKey = e.dataTransfer.getData('text/dr-itemkey');
    const dataItemJson = e.dataTransfer.getData('application/json');
    const dataListMove = e.dataTransfer.getData('text/dr-listmove');
    const def = getOrCreateDefaultList(targetColId);
    if (!def) return;
    try {
      const fromMeta = JSON.parse(e.dataTransfer.getData('text/dr-from') || '{}');
      // Move a list between collections
      if (dataListMove) {
        const move = JSON.parse(dataListMove);
        if (move && move.listId && fromMeta.fromColId) {
          const all = getCollections();
          const fromCol = all.find(c => c.id === fromMeta.fromColId);
          const toCol = all.find(c => c.id === targetColId);
          if (fromCol && toCol && fromCol.id !== toCol.id) {
            const idx = (fromCol.lists||[]).findIndex(l=> l.id === move.listId);
            if (idx !== -1) {
              const [listObj] = fromCol.lists.splice(idx,1);
              toCol.lists = Array.isArray(toCol.lists) ? toCol.lists : [];
              toCol.lists.push(listObj);
              saveCollections(all);
              setCollections(all);
              window.dispatchEvent(new CustomEvent('dr_toast', { detail: { message: 'Moved list to collection', variant: 'info', duration: 1200 } }));
              return;
            }
          }
        }
      }
      if (dataItemKey) {
        const item = resolveItemByKey(dataItemKey);
        if (fromMeta.fromColId && fromMeta.fromListId) {
          removeItemFromList(dataItemKey, fromMeta.fromColId, fromMeta.fromListId);
        }
        addItemToList(item, targetColId, def.id);
        setCollections(getCollections());
        window.dispatchEvent(new CustomEvent('dr_toast', { detail: { message: 'Moved to collection', variant: 'info', duration: 1200 } }));
        return;
      }
      if (dataItemJson) {
        const parsed = JSON.parse(dataItemJson);
        if (parsed && parsed.item) {
          addItemToList(parsed.item, targetColId, def.id);
          setCollections(getCollections());
          setActiveResult(null);
          window.dispatchEvent(new CustomEvent('dr_toast', { detail: { message: 'Added to collection', variant: 'info', duration: 1200 } }));
          return;
        }
      }
    } catch (err) {}
  }

  // filtered list for display and header count
  const filteredCollections = useMemo(() => {
    const q = String(query || "").toLowerCase();
    return (collections || []).filter(
      (c) =>
        !q ||
        String(c.title || "")
          .toLowerCase()
          .includes(q)
    );
  }, [collections, query]);

  // Helpers for tag normalization and filtering in expanded view
  function normalizeTag(s) {
    if (!s) return "";
    let t = String(s).trim().toLowerCase();
    try {
      t = t.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
    } catch (e) {}
    t = t.replace(/[^\p{L}\p{N}\s]+/gu, "");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }
  function toggleFilterTag(raw) {
    const k = normalizeTag(raw);
    if (!k) return;
    setActiveFilterTags((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [k, ...prev.filter((x) => x !== k)]
    );
  }
  function listMatchesAnyTagByTitle(list, tags) {
    if (!list || !tags || !tags.length) return false;
    const name = normalizeTag(list.title || "");
    return tags.some((t) => name.includes(t));
  }
  function itemMatchesAnyTag(item, tags) {
    if (!item || !tags || !tags.length) return false;
    const title = normalizeTag(item.title || item.query || "");
    const cat = normalizeTag(item.category || item.platform || "");
    return tags.some((t) => title.includes(t) || cat.includes(t));
  }
  function filteredItemKeysForList(list, col) {
    const keys = list.itemIds || [];
    if (!activeFilterTags.length) return keys;
    // If list title matches any active tag, keep all its items visible
    if (listMatchesAnyTagByTitle(list, activeFilterTags)) return keys;
    // Otherwise, filter items by title/category match
    const out = [];
    for (const k of keys) {
      const it = resolveItemByKey(k);
      if (itemMatchesAnyTag(it, activeFilterTags)) out.push(k);
    }
    return out;
  }

  return (
    <main className="dr-page dr-collections">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      />
      <div className="dr-searchbar-wrapper">
        <SearchHeader
          augmentSuggestions={(term) => {
            const t = String(term || '').toLowerCase();
            if (!t || t.length < 2) return [];
            const strongMatch = (s) => {
              const v = String(s || '').toLowerCase();
              if (t.length === 2) return v.startsWith(t) || v === t;
              return v.includes(t);
            };
            const colMatches = (collections || []).filter(c => strongMatch(c.title||'') || (c.tags||[]).some(tag => strongMatch(tag)));
            const listMatches = [];
            for (const c of collections || []) {
              for (const l of c.lists || []) {
                const name = String(l.title||'');
                if (strongMatch(name)) listMatches.push({ col: c, list: l });
              }
            }
            // Also surface item matches by title/query/category across lists
            const itemMatches = [];
            try {
              for (const c of collections || []) {
                for (const l of c.lists || []) {
                  for (const key of (l.itemIds || [])) {
                    const it = resolveItemByKey(key);
                    if (!it) continue;
                    const title = String(it.title || it.query || '').toLowerCase();
                    const cat = String(it.category || it.platform || '').toLowerCase();
                    if (!title && !cat) continue;
                    // Require >=3 chars for Items. For 2-char terms, prefer exact/startsWith and skip Items.
                    if (t.length >= 3 ? (title.includes(t) || cat.includes(t)) : false) {
                      itemMatches.push({ item: it, itemKey: key, col: c, list: l });
                      if (itemMatches.length >= 5) break;
                    }
                  }
                  if (itemMatches.length >= 5) break;
                }
                if (itemMatches.length >= 5) break;
              }
            } catch (e) {}
            const out = [];
            const pushCapped = (arr, item, cap) => { if (arr.length < cap) arr.push(item); };
            if (colMatches.length) {
              out.push({ label: 'Collections', source: 'section' });
              for (const c of colMatches.slice(0,4)) {
                const count = (c.lists||[]).reduce((s,l)=> s + (l.itemIds?.length||0), 0);
                pushCapped(out, { label: `${c.title} (${count})`, source: 'collection', category: 'Collection', id: c.id }, 12);
              }
            }
            if (listMatches.length) {
              out.push({ label: 'Lists', source: 'section' });
              for (const {col, list} of listMatches.slice(0,6)) {
                const count = (list.itemIds?.length||0);
                pushCapped(out, { label: `${list.title} (${count})`, source: 'list', category: col.title, id: list.id, colId: col.id }, 12);
              }
            }
            if (itemMatches.length) {
              out.push({ label: 'Items', source: 'section' });
              for (const m of itemMatches.slice(0,5)) {
                const { displayTitle } = formatResultTitle(m.item || {});
                const label = displayTitle || (m.item && (m.item.title || m.item.query)) || 'Item';
                pushCapped(out, {
                  label,
                  source: 'item',
                  category: `${m.col.title} › ${m.list.title}`,
                  itemKey: m.itemKey,
                  colId: m.col.id,
                  listId: m.list.id,
                }, 12);
              }
            }
            if (out.length) out.push({ label: 'sep', source: 'separator' });
            // Hard cap total suggestions at 12
            return out.slice(0, 12);
          }}
          onSearch={async (payload) => {
            // Handle synthetic suggestions for collections/lists
            if (typeof payload === 'object' && payload && (payload.source === 'collection' || payload.source === 'list' || payload.source === 'item')) {
              if (payload.source === 'collection' && payload.id) {
                setSelected({ collectionId: payload.id });
                setActiveResult(null);
              } else if (payload.source === 'list' && payload.id && payload.colId) {
                setSelected({ collectionId: payload.colId });
                setActiveResult(null);
                // after the collection opens, scroll to the target list and flash-highlight it
                setTimeout(() => {
                  try {
                    const el = listRefs.current && listRefs.current[payload.id];
                    if (el && typeof el.scrollIntoView === 'function') {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.classList.add('dr-flash');
                      setTimeout(() => el.classList.remove('dr-flash'), 1200);
                    }
                  } catch (e) {}
                }, 80);
              } else if (payload.source === 'item' && payload.itemKey && payload.colId && payload.listId) {
                // open the collection and scroll to the specific item
                setSelected({ collectionId: payload.colId });
                setActiveResult(null);
                setTimeout(() => {
                  try {
                    const listEl = listRefs.current && listRefs.current[payload.listId];
                    if (listEl && typeof listEl.scrollIntoView === 'function') {
                      listEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    const itemEl = document.querySelector(`[data-dr-itemkey="${payload.itemKey}"]`);
                    if (itemEl) {
                      itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      itemEl.classList.add('dr-flash');
                      setTimeout(() => itemEl.classList.remove('dr-flash'), 1200);
                    }
                  } catch (e) {}
                }, 120);
              }
              return;
            }
            const q = typeof payload === 'object' ? (payload.query || payload.label || '') : String(payload||'');
            if (!q) return;
            setSearchError(null);
            setSearchLoading(true);
            try {
              const res = await postSearch({ query: q });
              setActiveResult(res || null);
              if (res) saveRecent(res);
              try { localStorage.setItem('dr_last_analytics_item', JSON.stringify(res)); window.dispatchEvent(new CustomEvent('dr_last_analytics_item_changed')); } catch (e) {}
              try { fetch('/api/recent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: res.query || q, title: res.title || res.query || q }) }).catch(()=>{}); } catch (e) {}
            } catch (e) {
              setSearchError(e && e.message ? e.message : 'Search failed');
            } finally {
              setSearchLoading(false);
            }
          }}
          onDetected={async (det) => {
            try {
              if (!det || det.type !== 'barcode') return;
              const code = det.value;
              if (!code) return;
              setSearchError(null);
              setSearchLoading(true);
              // show a lightweight placeholder while searching
              setActiveResult({
                query: code,
                title: 'Searching…',
                upc: code,
                thumbnail: '/vite.svg',
                avgPrice: null,
                minPrice: null,
                maxPrice: null,
                soldListings: [],
                fetchedAt: new Date().toISOString(),
              });
              const res = await postSearch({ query: code, opts: { isBarcode: true, enrichUpcs: true } });
              setActiveResult(res || null);
              if (res) saveRecent(res);
              try { localStorage.setItem('dr_last_analytics_item', JSON.stringify(res)); window.dispatchEvent(new CustomEvent('dr_last_analytics_item_changed')); } catch (e) {}
              try { fetch('/api/recent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: res.query || code, title: res.title || res.query || code }) }).catch(()=>{}); } catch (e) {}
            } catch (e) {
              setSearchError(e && e.message ? e.message : 'Search failed');
            } finally {
              setSearchLoading(false);
            }
          }}
        />
      </div>

      {/* Inline search result area */}
      {(searchLoading || searchError || activeResult) && (
        <div className="dr-resultcard-wrap" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Search result</div>
            <button className="rounded border px-2 py-1 text-sm" onClick={()=>{ setActiveResult(null); setSearchError(null); }}>Dismiss</button>
          </div>
          {searchLoading && (
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
          {searchError && <div className="dr-error">{searchError}</div>}
          {activeResult && (
            <div draggable onDragStart={(e)=> onDragStartInlineItem(e, activeResult)}>
              <ResultCard item={activeResult} hideChart={true} onAnalyticsClick={(it)=> onNavigateToAnalytics && onNavigateToAnalytics(it)} />
            </div>
          )}
        </div>
      )}

      {/* Collections list */}
      <div className="mt-6">
        <div className="mb-3 flex items-center">
          <div className="inline-flex items-center gap-1 whitespace-nowrap">
            <h3 className="text-sm font-semibold whitespace-nowrap">
              Collections
            </h3>
            <div className="relative" ref={addAnchorRef}>
              <button
                className="rounded border px-1 py-1 -mt-px"
                title="Add New Collection"
                aria-label="Add New Collection"
                onClick={() => setAddOpen((o) => !o)}
              >
                <MdPlaylistAdd size={22} />
              </button>
              {addOpen && (
                <div className="absolute left-full top-0 ml-2 z-30">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateCollection(e);
                    }}
                    className="relative rounded-md border border-border bg-white dark:bg-neutral-900 shadow-lg p-3 w-[min(90vw,360px)]"
                  >
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <label className="text-xs text-muted-dynamic text-left">
                          Collection Name
                        </label>
                        <input
                          autoFocus
                          className="rounded-md border px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-border w-full"
                          placeholder="e.g., Switch Titles"
                          value={addName}
                          onChange={(e) => setAddName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey)
                              handleCreateCollection(e);
                          }}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs text-muted-dynamic text-left">
                          Tags
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {addTags.map((t) => (
                            <div key={t} className="dr-history-tag">
                              <button
                                type="button"
                                className="dr-history-tag-btn"
                                onClick={() => removeAddTag(t)}
                              >
                                <span className="dr-history-tag-label">
                                  {t}
                                </span>
                                <span className="dr-history-tag-x" aria-hidden>
                                  ×
                                </span>
                              </button>
                            </div>
                          ))}
                          <div className="inline-flex items-center gap-2">
                            <input
                              className="rounded-md border px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-border w-40"
                              placeholder="Add tag"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddTagSubmit();
                                  setTagInput("");
                                } else if (e.key === "Escape") {
                                  setTagInput("");
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="rounded border px-1 py-1"
                              title="Add Tags"
                              aria-label="Add Tags"
                              onClick={() => {
                                handleAddTagSubmit();
                                setTagInput("");
                              }}
                            >
                              <FaRegSquarePlus size={16} />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button type="submit" className="rounded border px-2 py-1 text-sm">
                          Create
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-sm"
                          onClick={() => {
                            setAddOpen(false);
                            setAddName("");
                            setAddTags([]);
                            setTagInput("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-dynamic">
            <div>{filteredCollections.length} collections</div>
          </div>
        </div>
        {filteredCollections.length === 0 ? (
          // Reuse Home starter empty state styling
          <div className="dr-resultcard-wrap dr-starter-card">
            <div className="dr-starter-inner">
              <div className="dr-starter-text">
                No collections yet. Create your first collection to start saving items.
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCollections.map((col) => (
              <div
                key={col.id}
                className="collection-card rounded-lg border p-3 hover:shadow-md cursor-pointer"
                onClick={() => openCollection(col.id)}
                onDragOver={(e)=>{ onDragOverAllow(e); e.currentTarget.classList.add('is-drop-target'); }}
                onDragLeave={(e)=>{ e.currentTarget.classList.remove('is-drop-target'); }}
                onDrop={(e)=>{ e.stopPropagation(); e.currentTarget.classList.remove('is-drop-target'); onDropToCollection(e, col.id); }}
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MdFolderCopy className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingCollectionId === col.id ? (
                      <div className="flex items-center gap-1" onClick={(e)=>e.stopPropagation()}>
                        <input
                          className="rounded border border-border px-2 py-1 text-sm w-full bg-transparent text-foreground placeholder:text-muted-dynamic focus:outline-none focus:ring-2 focus:ring-ring"
                          value={editingCollectionTitle}
                          onChange={(e) => setEditingCollectionTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEditCollection();
                            if (e.key === "Escape") setEditingCollectionId(null);
                          }}
                        />
                        <button className="rounded border px-2 py-1" onClick={(e)=>{e.stopPropagation(); saveEditCollection();}}>
                          <MdSave />
                        </button>
                        <button className="rounded border px-2 py-1" onClick={(e)=>{e.stopPropagation(); setEditingCollectionId(null);}}>
                          <MdClose />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="font-semibold truncate">{col.title}</div>
                        <button className="rounded border px-1 py-1" title="Rename" onClick={() => startEditCollection(col)}>
                          <MdEdit size={14} />
                        </button>
                      </div>
                    )}
                    <div className="tags-row mt-1 flex items-center gap-2 flex-wrap">
                      {(col.tags || []).slice(0, 3).map((tg) => (
                        <span key={tg} className="rounded-full border text-[11px]" style={{ padding: "4px 8px" }}>
                          <span className="font-medium">{tg}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="inline-flex h-7 min-w-[36px] items-center justify-center rounded-full text-sm font-semibold"
                      style={{ background: "#ED254E", color: "white" }}
                    >
                      {(col.lists || []).reduce((s, l) => s + (l.itemIds?.length || 0), 0)}
                    </div>
                    <button className="rounded border px-1 py-1" title="Delete" onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); try { e.nativeEvent && e.nativeEvent.stopImmediatePropagation && e.nativeEvent.stopImmediatePropagation(); } catch(_){} removeCollection(col.id); }}>
                      <MdDelete size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Selected collection detail */}
      {selected &&
        (() => {
          const col = (collections || []).find(
            (x) => x.id === selected.collectionId
          );
          if (!col) return null;
          return (
            <div className="mt-6 rounded border p-4 bg-white/40 dark:bg-black/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{col.title}</div>
                  <div className="text-sm text-muted-dynamic">
                    Total value: ${computeCollectionTotal(col).toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border px-2 py-1"
                    onClick={() => addList(col.id)}
                  >
                    Add List
                  </button>
                  <button className="rounded border px-2 py-1" onClick={() => { setTagModalValue("");
                    // gather suggestions from all existing tags across collections
                    const seen = new Set();
                    const sugg = [];
                    for (const c of getCollections() || []) {
                      for (const t of (c.tags || [])) {
                        const key = String(t).trim().toLowerCase();
                        if (!key || seen.has(key)) continue;
                        seen.add(key);
                        sugg.push(t);
                      }
                    }
                    setTagSuggestions(sugg.slice(0, 20));
                    setTagModalOpen(true);
                  }}>Add Tags</button>
                  <button
                    className="px-2 py-1 rounded border"
                    onClick={closeCollection}
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Filterable tag pills for this collection */}
              {(col.tags && col.tags.length > 0) && (
                <div className="dr-collection-tags-row" onClick={(e)=> e.stopPropagation()}>
                  {(col.tags || []).map((t) => {
                    const norm = normalizeTag(t);
                    const active = activeFilterTags.includes(norm);
                    return (
                      <div key={t} className={`dr-col-tag ${active ? 'active' : ''}`}>
                        <button
                          type="button"
                          className={`dr-col-tag-btn ${active ? 'active' : ''}`}
                          onClick={() => toggleFilterTag(t)}
                          title={t}
                        >
                          <span className="dr-col-tag-label">{t}</span>
                          {active && (
                            <span
                              className="dr-col-tag-x"
                              onClick={(e) => { e.stopPropagation(); toggleFilterTag(t); }}
                              aria-label={`Unselect ${t}`}
                            >
                              ×
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tag modal overlay */}
              {tagModalOpen && (
                <div className="dr-overlay" onClick={()=> setTagModalOpen(false)}>
                  <div className="dr-overlay-panel" onClick={(e)=> e.stopPropagation()} style={{ minWidth: 260 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Add Tag</div>
                    <input
                      autoFocus
                      className="rounded-md border px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-border w-full"
                      placeholder="Type a tag name"
                      value={tagModalValue}
                      onChange={(e)=> setTagModalValue(e.target.value)}
                      onKeyDown={(e)=>{
                        if (e.key==='Enter') {
                          const v = (tagModalValue||'').trim();
                          if (v) addTagToCollection(col.id, v);
                          setTagModalOpen(false);
                        }
                      }}
                    />
                    {tagSuggestions && tagSuggestions.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tagSuggestions.map((s) => (
                          <button key={s} className="dr-history-tag-btn" onClick={()=> { setTagModalValue(s); }} title={s}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                      <button className="rounded border px-2 py-1 text-sm" onClick={()=> setTagModalOpen(false)}>Cancel</button>
                      <button className="rounded border px-2 py-1 text-sm" onClick={()=> { const v = (tagModalValue||'').trim(); if (v) addTagToCollection(col.id, v); setTagModalOpen(false); }}>OK</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-3">
                {(col.lists || []).map((list) => (
                  <div
                    key={list.id}
                    className="rounded border p-3 bg-background/40"
                    ref={(el) => { if (el) listRefs.current[list.id] = el; }}
                    draggable
                    onDragStart={(e) => { onDragStartList(e, list.id); try { e.dataTransfer.setData('text/dr-listmove', JSON.stringify({ listId: list.id })); e.dataTransfer.setData('text/dr-from', JSON.stringify({ fromColId: col.id })); } catch(_){} }}
                    onDragOver={(e) => { onDragOverList(e); e.currentTarget.classList.add('is-drop-target'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('is-drop-target'); }}
                    onDrop={(e) => { e.currentTarget.classList.remove('is-drop-target'); onDropList(e, list.id, col.id); }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="cursor-grab text-muted-dynamic"><MdDragHandle /></span>
                        {editingListId === list.id ? (
                          <div className="flex items-center gap-1" onClick={(e)=>e.stopPropagation()}>
                            <input
                              className="rounded border border-border px-2 py-1 text-sm bg-transparent text-foreground placeholder:text-muted-dynamic focus:outline-none focus:ring-2 focus:ring-ring"
                              value={editingListTitle}
                              onChange={(e) => setEditingListTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEditList(col.id);
                                if (e.key === "Escape") setEditingListId(null);
                              }}
                            />
                            <button className="rounded border px-2 py-1" onClick={(e)=>{e.stopPropagation(); saveEditList(col.id);}}>
                              <MdSave />
                            </button>
                            <button className="rounded border px-2 py-1" onClick={(e)=>{e.stopPropagation(); setEditingListId(null);}}>
                              <MdClose />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2" onClick={(e)=>e.stopPropagation()}>
                            <div className="font-semibold">{list.title}</div>
                            <button className="rounded border px-1 py-1" title="Rename" onClick={() => startEditList(list)}>
                              <MdEdit size={14} />
                            </button>
                            <button className="rounded border px-1 py-1" title="Delete" onClick={() => removeList(col.id, list.id)}>
                              <MdDelete size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          ${computeListTotal(list.itemIds).toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-dynamic text-right">Items: {list.itemIds?.length || 0}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3">
                      {filteredItemKeysForList(list, col).map((key) => {
                        const it = resolveItemByKey(key);
                        if (!it) return null;
                        return (
                          <div key={key} data-dr-itemkey={key} draggable onDragStart={(e)=> onDragStartItem(e, key, col.id, list.id)}>
                            <ResultCard item={it} hideChart={true} onAnalyticsClick={(item)=> onNavigateToAnalytics && onNavigateToAnalytics(item)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
    </main>
  );
}
