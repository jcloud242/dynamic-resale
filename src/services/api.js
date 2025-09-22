export async function postSearch(payload, opts = {}) {
  // allow callers to pass flags either in payload.opts or at top-level of payload
  const body = Object.assign({}, payload, { opts: Object.assign({}, opts, payload.opts || {}) });
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error('search-failed');
    err.info = data || { status: res.status };
    throw err;
  }
  // if caller indicated this was a barcode scan and server didn't supply a UPC,
  // inject the scanned value (payload.query) for immediate UI display
  try {
    const isBarcode = (body.opts && body.opts.isBarcode) || false;
    if (isBarcode && data && !data.upc && body.query) {
      data.upc = String(body.query);
    }
  } catch (e) {}
  return data;
}

export async function postSearchForce(query) {
  return postSearch({ query, force: true });
}
