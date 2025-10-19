// Collections and Items persistence helpers
// Storage keys
const KEY_COLLECTIONS = "dr_collections";
const KEY_ITEMS = "dr_items"; // map: { [itemKey]: item }

// Util: derive a stable-ish item key
export function getItemKey(item) {
  if (!item || typeof item !== "object") return null;
  return (
    item.id ||
    (item.upc ? `upc:${item.upc}` : null) ||
    (item.query ? `q:${String(item.query).trim().toLowerCase()}` : null) ||
    (item.title ? `t:${String(item.title).trim().toLowerCase()}` : null)
  );
}

export function getCollections() {
  try {
    const raw = localStorage.getItem(KEY_COLLECTIONS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export function saveCollections(collections) {
  try {
    localStorage.setItem(KEY_COLLECTIONS, JSON.stringify(collections || []));
  } catch (e) {}
  try {
    window.dispatchEvent(new CustomEvent("dr_collections_changed"));
  } catch (e) {}
}

export function getItems() {
  try {
    const raw = localStorage.getItem(KEY_ITEMS);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch (e) {
    return {};
  }
}

export function saveItems(itemsMap) {
  try {
    localStorage.setItem(KEY_ITEMS, JSON.stringify(itemsMap || {}));
  } catch (e) {}
  try {
    window.dispatchEvent(new CustomEvent("dr_items_changed"));
  } catch (e) {}
}

// Upsert item into items store
export function upsertItem(item) {
  const key = getItemKey(item);
  if (!key) return null;
  const items = getItems();
  // store a compact snapshot to avoid ever storing heavy/circular data
  const safe = {
    id: item.id || undefined,
    query: item.query || undefined,
    title: item.title || undefined,
    upc: item.upc || undefined,
    thumbnail: item.thumbnail || undefined,
    avgPrice: item.avgPrice != null ? Number(item.avgPrice) : undefined,
    minPrice: item.minPrice != null ? Number(item.minPrice) : undefined,
    maxPrice: item.maxPrice != null ? Number(item.maxPrice) : undefined,
    fetchedAt: item.fetchedAt || new Date().toISOString(),
    // keep small timeSeries skeleton if present (omit large arrays to stay safe)
    timeSeries: item.timeSeries && typeof item.timeSeries === 'object' ? {
      avg: Array.isArray(item.timeSeries.avg) ? item.timeSeries.avg.slice(0, 12) : [],
      min: Array.isArray(item.timeSeries.min) ? item.timeSeries.min.slice(0, 12) : [],
      max: Array.isArray(item.timeSeries.max) ? item.timeSeries.max.slice(0, 12) : [],
    } : { avg: [], min: [], max: [] },
    // helpful metadata for badges
    platform: item.platform || item.category || undefined,
    releaseYear: item.releaseYear || undefined,
    rawCount: item.rawCount != null ? Number(item.rawCount) : undefined,
    filteredCount: item.filteredCount != null ? Number(item.filteredCount) : undefined,
  };
  items[key] = Object.assign({}, items[key] || {}, safe);
  saveItems(items);
  return key;
}

export function removeItemKey(itemKey) {
  const items = getItems();
  if (items[itemKey]) {
    delete items[itemKey];
    saveItems(items);
  }
}

export function createCollection({ title, tags = [] }) {
  const collections = getCollections();
  const col = {
    id: `c${Date.now()}`,
    title: title || "Untitled",
    tags: Array.isArray(tags) ? tags : [],
    lists: [],
  };
  collections.push(col);
  saveCollections(collections);
  return col;
}

export function deleteCollection(collectionId) {
  const collections = getCollections();
  const idx = collections.findIndex((c) => c.id === collectionId);
  if (idx !== -1) {
    collections.splice(idx, 1);
    saveCollections(collections);
  }
}

export function renameCollection(collectionId, newTitle) {
  const collections = getCollections().map((c) =>
    c.id === collectionId ? { ...c, title: newTitle } : c
  );
  saveCollections(collections);
}

export function createList(collectionId, { title }) {
  const collections = getCollections();
  const col = collections.find((c) => c.id === collectionId);
  if (!col) return null;
  const list = { id: `l${Date.now()}`, title: title || "Untitled", itemIds: [] };
  col.lists = Array.isArray(col.lists) ? col.lists : [];
  col.lists.push(list);
  saveCollections(collections);
  return list;
}

export function deleteList(collectionId, listId) {
  const collections = getCollections();
  const col = collections.find((c) => c.id === collectionId);
  if (!col) return;
  col.lists = (col.lists || []).filter((l) => l.id !== listId);
  saveCollections(collections);
}

export function renameList(collectionId, listId, newTitle) {
  const collections = getCollections();
  const col = collections.find((c) => c.id === collectionId);
  if (!col) return;
  col.lists = (col.lists || []).map((l) => (l.id === listId ? { ...l, title: newTitle } : l));
  saveCollections(collections);
}

export function reorderLists(collectionId, newOrderIds) {
  const collections = getCollections();
  const col = collections.find((c) => c.id === collectionId);
  if (!col) return;
  const idToList = new Map((col.lists || []).map((l) => [l.id, l]));
  col.lists = newOrderIds.map((id) => idToList.get(id)).filter(Boolean);
  saveCollections(collections);
}

export function addItemToList(item, collectionId, listId) {
  const key = upsertItem(item);
  if (!key) return false;
  const collections = getCollections();
  const col = collections.find((c) => c.id === collectionId);
  if (!col) return false;
  const list = (col.lists || []).find((l) => l.id === listId);
  if (!list) return false;
  list.itemIds = Array.isArray(list.itemIds) ? list.itemIds : [];
  if (!list.itemIds.includes(key)) list.itemIds.push(key);
  saveCollections(collections);
  return true;
}

export function removeItemFromList(itemKey, collectionId, listId) {
  const collections = getCollections();
  const col = collections.find((c) => c.id === collectionId);
  if (!col) return false;
  const list = (col.lists || []).find((l) => l.id === listId);
  if (!list) return false;
  list.itemIds = (list.itemIds || []).filter((k) => k !== itemKey);
  saveCollections(collections);
  return true;
}

export function isItemInList(itemOrKey, collectionId, listId) {
  const key = typeof itemOrKey === "string" ? itemOrKey : getItemKey(itemOrKey);
  if (!key) return false;
  const collections = getCollections();
  const col = collections.find((c) => c.id === collectionId);
  const list = col && (col.lists || []).find((l) => l.id === listId);
  return !!(list && (list.itemIds || []).includes(key));
}

export function getAllMemberships(itemOrKey) {
  const key = typeof itemOrKey === "string" ? itemOrKey : getItemKey(itemOrKey);
  if (!key) return [];
  const collections = getCollections();
  const res = [];
  for (const c of collections) {
    for (const l of c.lists || []) {
      if ((l.itemIds || []).includes(key)) res.push({ collectionId: c.id, listId: l.id });
    }
  }
  return res;
}
