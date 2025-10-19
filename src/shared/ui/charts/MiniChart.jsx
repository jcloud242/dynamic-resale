import '../../styles/resultchart.css';

// Lightweight standalone mini chart component.
export default function MiniChart({ series = {}, width = 380, height = 110, accent = 'var(--accent)', showFill = true, showMinMax = true, primary = 'var(--primary)', showAxes = false, xTicks = 4, yTicks = 3 }) {
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
			<defs>
				{showFill && (
					<linearGradient id="miniAvgFill" x1="0" x2="0" y1="0" y2="1">
						<stop offset="6%" stopColor={primary} stopOpacity="0.12" />
						<stop offset="95%" stopColor={primary} stopOpacity="0" />
					</linearGradient>
				)}
			</defs>
			<rect x="0" y="0" width={width} height={height} fill="none" />
			{/* Optional axes rendering (minimalist): */}
			{showAxes && (() => {
				const labels = [];
				for (let yi = 0; yi <= yTicks; yi++) {
					const v = Math.round((minVal + (range * (yi / yTicks))) * 100) / 100;
					const y = Math.round(height - ((v - minVal) / range) * height);
					labels.push(<text key={`y-${yi}`} x={6} y={y} fill="var(--muted)" fontSize={10} textAnchor="start">{v}</text>);
				}
				const xt = [];
				const ptsCount = Math.max(1, pts - 1);
				for (let xi = 0; xi <= xTicks; xi++) {
					const idx = Math.round((xi / xTicks) * ptsCount);
					const label = (avg[idx] && avg[idx].t) ? new Date(avg[idx].t).toISOString().slice(0,10).slice(5) : '';
					const x = Math.round((idx / Math.max(1, ptsCount)) * width);
					xt.push(<text key={`x-${xi}`} x={x} y={height - 4} fill="var(--muted)" fontSize={10} textAnchor="middle">{label}</text>);
				}
				return (<g className="axes">{labels}{xt}</g>);
			})()}
			{showMinMax && minPath && <path d={minPath} fill="none" strokeOpacity={0.28} strokeWidth={1} stroke="var(--muted)" strokeLinejoin="round" strokeLinecap="round" />}
			{showMinMax && maxPath && <path d={maxPath} fill="none" strokeOpacity={0.28} strokeWidth={1} stroke="var(--muted)" strokeLinejoin="round" strokeLinecap="round" />}
			{avgPath && (
				<>
					{showFill ? (
						<path d={`${avgPath} L ${width} ${height} L 0 ${height} Z`} fill="url(#miniAvgFill)" opacity={0.95} />
					) : null}
					<path d={avgPath} fill="none" stroke={accent || primary} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
				</>
			)}
		</svg>
	);
}
