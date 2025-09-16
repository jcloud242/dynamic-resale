import React from 'react';
import './resultcard.css';

function cleanTitle(title) {
  if (!title) return '';
  let cleaned = title.replace(/[-:]+/g, ' ').replace(/\s+/g, ' ').trim();
  const plusIndex = cleaned.indexOf('+');
  if (plusIndex !== -1) cleaned = cleaned.substring(0, plusIndex).trim();
  return cleaned;
}

export default function ResultCard({ item }) {
  if (!item) return null;
  return (
    <div className="dr-resultcard">
      <img src={item.thumbnail || '/vite.svg'} alt="thumb" className="dr-thumb" />
      <div className="dr-main">
        <div className="dr-title">{cleanTitle(item.title)}</div>
        <div className="dr-meta">UPC: {item.upc} • {new Date().toLocaleString()}</div>
      </div>
      <div className="dr-stats">
        <div className="dr-avg">${item.avgPrice}</div>
        <div className="dr-minmax">Min ${item.minPrice} • Max ${item.maxPrice}</div>
      </div>
    </div>
  );
}
