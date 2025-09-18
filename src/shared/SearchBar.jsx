import React, { useState } from 'react';
import './searchbar.css';
import { LuScanBarcode, LuSearch, LuCamera } from 'react-icons/lu';


export default function SearchBar({ onSearch, onOpenCamera, onOpenImage }) {
  const [q, setQ] = useState('');

  function submit(e) {
    e && e.preventDefault();
    if (!q) return;
    onSearch(q);
    setQ('');
  }

  return (
    <form className="dr-searchbar" onSubmit={submit}>
      <div className="dr-scan-actions">
        <button type="button" className="dr-scan-icon" aria-label="Scan barcode" onClick={() => onOpenCamera && onOpenCamera()}><LuScanBarcode size={24} /></button>
        <button type="button" className="dr-photo-icon" aria-label="Image lookup" onClick={() => onOpenImage && onOpenImage()}><LuCamera size={24} /></button>
      </div>
      <input
        placeholder="Search title, UPC, ISBN..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button type="submit" className="dr-search-icon" aria-label="Search"><LuSearch size={20} /></button>
    </form>
  );
}
