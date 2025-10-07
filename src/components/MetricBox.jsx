import React from 'react';

export default function MetricBox({ label, value, sub, accent, variant = 'default' }) {
  // value and sub may be strings or JSX nodes. Variant 'dark' applies a denser look.
  // default KPI color should follow theme foreground to separate from table red prices
  const valueStyle = accent ? { color: accent } : undefined;
  const cls = `metric-box ${variant === 'dark' ? 'metric-box-dark' : ''}`;
  return (
    <div className={cls}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={valueStyle}>{value}</div>
      {sub ? <div className="metric-sub">{sub}</div> : null}
    </div>
  );
}
