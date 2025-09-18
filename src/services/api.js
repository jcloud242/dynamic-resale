export async function postSearch(payload) {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error('search-failed');
    err.info = data || { status: res.status };
    throw err;
  }
  return data;
}

export async function postSearchForce(query) {
  return postSearch({ query, force: true });
}
