import React from 'react';
import ResultCard from './ResultCard.jsx';


export default function ResultList({ items = [], active = false }) {
  return (
    <div className="dr-resultlist">
      {items.length === 0 && <div className="dr-empty">No results</div>}
      {items.map((it, i) => (
        <ResultCard key={i} item={it} isActive={active} />
      ))}
    </div>
  );
}
