import React, { useState } from 'react';
import './searchbar.css';

export default function SearchBar({ onSearch }) {
  const [q, setQ] = useState('');

  function submit(e) {
    e && e.preventDefault();
    if (!q) return;
    onSearch(q);
    setQ('');
  }

  return (
    <form className="dr-searchbar" onSubmit={submit}>
      <input
        placeholder="Search title, UPC, ISBN..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button type="submit" aria-label="Search">🔍</button>
    </form>
  );
}
