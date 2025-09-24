import React from 'react';
import './resultchart.css';

// Lightweight standalone mini chart component.
export default function MiniChart({ series = {}, width = 380, height = 110, accent = 'var(--accent)' }) {
  // make SVG responsive by relying on viewBox and percent width in CSS
  const avg = (series.avg || []).slice(-12);
  const min = (series.min || []).slice(-12);
  const max = (series.max || []).slice(-12);
  const pts = avg.length || min.length || max.length ? (avg.length || min.length || max.length) : 0;
  if (!pts) return <div className="dr-mini-empty" style={{width: width, height: height}}>No data</div>;
  const allVals = [].concat(avg.map(p=>p.v), min.map(p=>p.v), max.map(p=>p.v)).filter(v=>v!==null && v!==undefined);
  const maxVal = Math.max(...allVals);
  const minVal = Math.min(...allVals);
  const range = Math.max(1e-6, maxVal - minVal);
  const xStep = width / Math.max(1, pts-1);

  const buildPath = (arr) => {
    if (!arr || !arr.length) return '';
    return arr.map((p, i) => {
      const x = Math.round(i * xStep);
      const y = Math.round(height - ((p.v - minVal) / range) * height);
      return `${i===0? 'M':'L'} ${x} ${y}`;
    }).join(' ');
  };

  const avgPath = buildPath(avg);
  const minPath = buildPath(min);
  const maxPath = buildPath(max);

  return (
    <svg className="dr-mini-chart" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <rect x="0" y="0" width={width} height={height} fill="none" />
      {minPath && <path d={minPath} fill="none" strokeOpacity={0.28} strokeWidth={1} stroke="var(--muted)" strokeLinejoin="round" strokeLinecap="round" />}
      {maxPath && <path d={maxPath} fill="none" strokeOpacity={0.28} strokeWidth={1} stroke="var(--muted)" strokeLinejoin="round" strokeLinecap="round" />}
      {avgPath && <path d={avgPath} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}
