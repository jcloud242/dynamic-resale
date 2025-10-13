import React from 'react';

export default function MetricBox({ label, value, sub, accent, variant = 'default' }) {
  // value and sub may be strings or JSX nodes. Variant 'dark' applies a denser look.
  // default KPI color should follow theme foreground to separate from table red prices
  const valueStyle = accent ? { color: accent } : undefined;
  const cls = `metric-box ${variant === 'dark' ? 'metric-box-dark' : ''}`;
  return (
    <div className="rounded-lg border p-3 bg-card/40 flex flex-col gap-2">
      <div className="text-xs text-muted-dynamic">{label}</div>
      <div className="text-2xl font-bold" style={valueStyle}>{value}</div>
      {sub ? <div className="text-xs text-muted-dynamic">{sub}</div> : null}
    </div>
  );
}
