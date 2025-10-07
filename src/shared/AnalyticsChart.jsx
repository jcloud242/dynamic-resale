import React from 'react';
import './resultchart.css';

// Slightly larger chart tuned for Analytics view (thicker primary line, dashed min/max)
export default function AnalyticsChart({ series = {}, width = 680, height = 260, accent = 'var(--accent)', showFill = false, showMinMax = true, primary = 'var(--primary)', showAxes = true, xTicks = 6, yTicks = 3 }) {
  const avg = (series.avg || []).slice(-24);
  const min = (series.min || []).slice(-24);
  const max = (series.max || []).slice(-24);
  const pts = avg.length || min.length || max.length ? (avg.length || min.length || max.length) : 0;
  if (!pts) return <div className="dr-mini-empty" style={{width: width, height: height}}>No data</div>;
  const allVals = [].concat(avg.map(p=>p.v), min.map(p=>p.v), max.map(p=>p.v)).filter(v=>v!==null && v!==undefined);
  const maxVal = Math.max(...allVals);
  const minVal = Math.min(...allVals);
  const range = Math.max(1e-6, maxVal - minVal);
  const leftPad = 44; // space for y labels
  const rightPad = 12;
  const effectiveWidth = Math.max(8, width - leftPad - rightPad);
  const xStep = effectiveWidth / Math.max(1, pts-1);
  const yPadding = 8; // leave space from top/bottom so labels don't overlap edges

  const buildPath = (arr) => {
    if (!arr || !arr.length) return '';
    return arr.map((p, i) => {
      const x = Math.round(leftPad + i * xStep);
      const y = Math.round(yPadding + (1 - ((p.v - minVal) / range)) * (height - (yPadding * 2)));
      return `${i===0? 'M':'L'} ${x} ${y}`;
    }).join(' ');
  };

  const avgPath = buildPath(avg);
  const minPath = buildPath(min);
  const maxPath = buildPath(max);

  return (
    <svg className="dr-analytics-chart" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        {showFill && (
          <linearGradient id="analyticsAvgFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="6%" stopColor={primary} stopOpacity="0.06" />
            <stop offset="95%" stopColor={primary} stopOpacity="0" />
          </linearGradient>
        )}
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="none" />
      {showAxes && (() => {
        const labels = [];
        // draw subtle horizontal grid lines + y labels
  // yPadding already defined above for use in buildPath
        for (let yi = 0; yi <= yTicks; yi++) {
          const frac = yi / yTicks;
          const v = Math.round((minVal + (range * frac)) * 100) / 100;
          const y = Math.round(yPadding + (1 - frac) * (height - (yPadding * 2)));
          labels.push(<line key={`g-${yi}`} x1={leftPad} x2={width - rightPad} y1={y} y2={y} stroke="var(--muted)" strokeOpacity={0.06} strokeWidth={1} />);
          labels.push(<text key={`y-${yi}`} x={10} y={y + 4} fill="var(--muted)" fontSize={11} textAnchor="start">{v}</text>);
        }
  const xt = [];
  const ptsCount = Math.max(1, pts - 1);
  const ticksToShow = Math.min(xTicks, ptsCount);
        const monthFmt = (ts) => {
          try { const d = new Date(ts); return d.toLocaleString(undefined, { month: 'short' }); } catch (e) { return ''; }
        };
        const xPadding = leftPad;
        for (let xi = 0; xi <= ticksToShow; xi++) {
          const idx = Math.round((xi / Math.max(1, ticksToShow)) * ptsCount);
          const label = (avg[idx] && avg[idx].t) ? monthFmt(avg[idx].t) : '';
          const x = Math.round(leftPad + (idx / Math.max(1, ptsCount)) * effectiveWidth);
          xt.push(<text key={`x-${xi}`} x={x} y={height - 6} fill="var(--muted)" fontSize={11} textAnchor="middle">{label}</text>);
        }
        return (<g className="axes">{labels}{xt}</g>);
      })()}
  {showMinMax && minPath && <path d={minPath} fill="none" strokeOpacity={0.18} strokeWidth={1} strokeDasharray={"6 6"} stroke={primary} strokeLinejoin="round" strokeLinecap="round" />}
  {showMinMax && maxPath && <path d={maxPath} fill="none" strokeOpacity={0.18} strokeWidth={1} strokeDasharray={"6 6"} stroke={primary} strokeLinejoin="round" strokeLinecap="round" />}
      {avgPath && (
        <>
          {showFill ? (
            <path d={`${avgPath} L ${width} ${height} L 0 ${height} Z`} fill="url(#analyticsAvgFill)" opacity={0.95} />
          ) : null}
          <path d={avgPath} fill="none" stroke={accent || primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
