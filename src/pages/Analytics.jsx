import React from 'react';
import MiniChart from '../shared/MiniChart.jsx';

export default function Analytics({ item, onBack }) {
  if (!item) return (
    <main style={{padding:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <h2 style={{margin:0}}>Analytics</h2>
      </div>
      <div style={{marginTop:12}}>No item selected</div>
    </main>
  );
  return (
    <main style={{padding:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <h2 style={{margin:0}}>Analytics</h2>
        <div>
          <button onClick={() => { if (onBack) onBack(); }}>Back</button>
        </div>
      </div>
      <div style={{display:'flex',gap:16,marginTop:12}}>
        <img src={item.thumbnail || '/vite.svg'} alt="thumb" style={{width:160,height:160,objectFit:'cover',borderRadius:8}} />
        <div style={{flex:1}}>
          <h3 style={{marginTop:0}}>{item.title || item.query}</h3>
          <div style={{maxWidth:640}}>
            <MiniChart series={item.timeSeries || { avg: [], min: [], max: [] }} width={640} height={220} accent={'var(--accent)'} />
          </div>
        </div>
      </div>
    </main>
  );
}
