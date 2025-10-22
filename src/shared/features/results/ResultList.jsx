import ResultCard from './ResultCard.jsx';


export default function ResultList({ items = [], active = false, hideChart = false, onAnalyticsClick = null, getDataKey = null }) {
	return (
		<div className="dr-resultlist">
			{items.length === 0 && <div className="dr-empty">No results</div>}
			{items.map((it, i) => (
				<ResultCard
					key={i}
					item={it}
					isActive={active}
					hideChart={hideChart}
					onAnalyticsClick={onAnalyticsClick}
					dataKey={typeof getDataKey === 'function' ? getDataKey(it) : undefined}
				/>
			))}
		</div>
	);
}
