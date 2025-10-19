import { useEffect, useMemo, useRef, useState } from "react";
import ResultCard from "@features/results/ResultCard.jsx";
import SearchBar from "@features/search/SearchBar.jsx";
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
} from "@services/collections.js";
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

export default function Collections() {
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
    return () => window.removeEventListener("dr_collections_changed", onChange);
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

  function openCollection(collectionId) {
    setSelected({ collectionId });
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
    deleteCollection(collectionId);
    setCollections(getCollections());
    if (selected && selected.collectionId === collectionId) setSelected(null);
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
        <SearchBar
          onSearch={() => {}}
          onOpenCamera={() => {}}
          onOpenImage={() => {}}
        />
      </div>

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
                className="rounded-lg border p-3 hover:shadow-md cursor-pointer"
                onClick={() => openCollection(col.id)}
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
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
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
                    <button className="rounded border px-1 py-1" title="Delete" onClick={(e)=>{e.stopPropagation(); removeCollection(col.id);}}>
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
                  <button
                    className="px-2 py-1 rounded border"
                    onClick={closeCollection}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {(col.lists || []).map((list) => (
                  <div
                    key={list.id}
                    className="rounded border p-3 bg-background/40"
                    draggable
                    onDragStart={(e) => onDragStartList(e, list.id)}
                    onDragOver={onDragOverList}
                    onDrop={(e) => onDropList(e, list.id, col.id)}
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
                      {(list.itemIds || []).map((key) => {
                        const it = resolveItemByKey(key);
                        if (!it) return null;
                        return (
                          <ResultCard key={key} item={it} hideChart={true} onAnalyticsClick={() => {}} />
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
