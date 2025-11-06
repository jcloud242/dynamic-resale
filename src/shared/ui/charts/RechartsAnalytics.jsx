import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// series expects { avg: [{t, v}], min: [{t,v}], max: [{t,v}] }
export default function RechartsAnalytics({
  series,
  height = 260,
  accent = "#0ea5a6",
  primary = "#2563eb",
}) {
  // normalize series to numeric timestamps for better tick control
  // aggregate series by month so ticks line up precisely
  const monthMap = {};
  function monthKey(ts) {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  if (series && Array.isArray(series.avg)) {
    for (const p of series.avg) {
      const k = monthKey(p.t);
      monthMap[k] = monthMap[k] || { x: k, avg: 0, count: 0 };
      monthMap[k].avg += Number(p.v || 0);
      monthMap[k].count += 1;
    }
  }
  if (series && Array.isArray(series.min)) {
    for (const p of series.min) {
      const k = monthKey(p.t);
      monthMap[k] = monthMap[k] || { x: k };
      monthMap[k].min = Number(p.v);
    }
  }
  if (series && Array.isArray(series.max)) {
    for (const p of series.max) {
      const k = monthKey(p.t);
      monthMap[k] = monthMap[k] || { x: k };
      monthMap[k].max = Number(p.v);
    }
  }
  const ptsMap = Object.keys(monthMap).reduce((acc, k) => {
    acc[k] = monthMap[k];
    return acc;
  }, {});

  // build a full 12-month array so labels are evenly spaced even if some months have no data
  const months = [];
  const now = new Date();
  const cur = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(cur.getFullYear(), cur.getMonth() - i, 1);
    const k = d.getTime();
    const existing = ptsMap[k] || {};
    const avg =
      existing.count && existing.count > 0
        ? Number((existing.avg / existing.count).toFixed(2))
        : existing.avg !== undefined
        ? existing.avg
        : null;
    months.push({
      x: k,
      tLabel: fmtMonth(k),
      avg: avg,
      min: existing.min !== undefined ? existing.min : null,
      max: existing.max !== undefined ? existing.max : null,
    });
  }

  const pts = months;

  // forward-fill missing values so lines draw continuously across months
  let lastAvg = null;
  let lastMin = null;
  let lastMax = null;
  for (const m of pts) {
    if (m.avg === null || typeof m.avg === "undefined") m.avg = lastAvg;
    else lastAvg = m.avg;
    if (m.min === null || typeof m.min === "undefined") m.min = lastMin;
    else lastMin = m.min;
    if (m.max === null || typeof m.max === "undefined") m.max = lastMax;
    else lastMax = m.max;
  }

  function fmtMonth(ts) {
    const d = new Date(ts);
    return (
      d.toLocaleString("en-US", { month: "short" }) +
      "-" +
      String(d.getFullYear()).slice(-2)
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={pts} margin={{ top: 8, right: 12, left: 8, bottom: 36 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="tLabel"
          type="category"
          ticks={months.map((m) => m.tLabel)}
          tick={{ fontSize: 12 }}
          interval={0}
          tickLine={false}
          axisLine={{ stroke: "var(--muted)" }}
          angle={-25}
          textAnchor="end"
        />
        <YAxis
          tickFormatter={(v) => Number(v).toFixed(2)}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          labelFormatter={(label) => String(label)}
          formatter={(value) => ["$" + Number(value).toFixed(2), "Price"]}
        />
        <Legend />
        {series && series.min && (
          <Line
            connectNulls={true}
            type="monotone"
            dataKey="min"
            stroke={"var(--chart-min, #fff)"}
            strokeWidth={1}
            dot={false}
            strokeOpacity={1}
          />
        )}
        <Line
          connectNulls={true}
          type="monotone"
          dataKey="avg"
          stroke={accent}
          strokeWidth={3}
          dot={{ r: 2 }}
        />
        {series && series.max && (
          <Line
            connectNulls={true}
            type="monotone"
            dataKey="max"
            stroke={"var(--chart-max, #000)"}
            strokeWidth={1}
            dot={false}
            strokeOpacity={1}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
