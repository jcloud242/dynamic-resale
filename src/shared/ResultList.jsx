import React from 'react';
import ResultCard from './ResultCard.jsx';


export default function ResultList({ items = [] }) {
  return (
    <div className="dr-resultlist">
      {items.length === 0 && <div className="dr-empty">No results</div>}
      {items.map((it, i) => (
        <ResultCard key={i} item={it} />
      ))}
    </div>
  );
}
