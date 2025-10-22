import { useState, useEffect, useRef } from 'react';
import '../../styles/searchbar.css';
import { LuScanBarcode, LuSearch} from 'react-icons/lu';
import { RiCameraAiLine } from "react-icons/ri";


export default function SearchBar({ onSearch, onOpenCamera, onOpenImage, showScans = true, placeholder = 'Search title, UPC, ISBN...', augmentSuggestions = null, serverSuggest = true }) {
	const [q, setQ] = useState('');
	const [suggestions, setSuggestions] = useState([]);
	const [visibleSuggestions, setVisibleSuggestions] = useState([]); // array of { label, source, category }
	const [loadingSuggest, setLoadingSuggest] = useState(false);
	const [helperText, setHelperText] = useState(null);
	const [highlightIndex, setHighlightIndex] = useState(-1);
	const submittingRef = useRef(false);
	const suggestTimer = useRef(null);
	const wrapperRef = useRef(null);

	useEffect(() => {
		// load recent searches from localStorage (same key used by Home.jsx)
		try {
			const raw = JSON.parse(localStorage.getItem('dr_recent') || '[]');
			if (Array.isArray(raw)) setSuggestions(raw.slice(0, 10));
		} catch (e) {
			setSuggestions([]);
		}
	}, []);

	useEffect(() => {
		// debounce fetching server suggestions
		if (suggestTimer.current) clearTimeout(suggestTimer.current);
		if (!q) {
			setVisibleSuggestions([]);
			setLoadingSuggest(false);
			setHelperText(null);
			setHighlightIndex(-1);
			return;
		}
		const term = q.toLowerCase().trim();
			if (term.length < 2) {
				// require 2+ chars for any suggestions UI at all
				setVisibleSuggestions([]);
				setLoadingSuggest(false);
				setHelperText('Type 2 or more characters for suggestions');
				setHighlightIndex(-1);
				return;
			}
		setHelperText(null);
			// eager local filtering first with short-query bias: for 2-char terms prefer startsWith
			const filteredLocal = (suggestions || [])
				.map(s => ({ label: (s && (s.query || s)) || s, source: 'recent' }))
				.filter(s => {
					if (!s || !s.label) return false;
					const lab = String(s.label).toLowerCase();
					if (term.length === 2) return lab.startsWith(term);
					return lab.includes(term);
				})
				.slice(0, 6);
		// schedule suggestions (server optional)
			setLoadingSuggest(true);
		suggestTimer.current = setTimeout(async () => {
			try {
					let server = [];
					// Env toggles
					const allowServerEnv = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUGGEST_SERVER !== '0');
					const allowEbayEnv = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUGGEST_EBAY !== '0');
					const allowServerThisTerm = serverSuggest && allowServerEnv && term.length >= 3;
					if (allowServerThisTerm) {
					// prefer server-side ranked suggestions (v2), fallback to simple v1
					let data = null;
					try {
						const r2 = await fetch(`/api/suggest-v2?q=${encodeURIComponent(q)}`);
						if (r2.ok) data = await r2.json();
					} catch (err) {}
					if (!data) {
						const r1 = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
						data = r1.ok ? await r1.json() : null;
					}
					server = (data && data.suggestions) || [];
					}
					const merged = [];
					const seen = new Set();
				// helper to detect likely game titles
				const isLikelyGame = (s) => {
					if (!s) return false;
					const label = (s.label || '').toLowerCase();
					const cat = (s.category || '').toLowerCase();
					const tokens = ['nintendo switch','switch','ps5','ps4','wii u','wii','3ds','ds','xbox','playstation','edition'];
					for (const t of tokens) if (label.includes(t) || cat.includes(t)) return true;
					return false;
				};
				// first include server suggestions and collect games separately to promote
				const serverFiltered = (server || []).map(s => ({ label: s.label || s, source: s.source || 'server', category: s.category || null }));
				const gameBuckets = [];
				const otherBuckets = [];
				for (const s of serverFiltered) {
					const lab = s && s.label;
					if (!lab) continue;
					if (seen.has(lab)) continue;
					seen.add(lab);
					if (isLikelyGame(s)) gameBuckets.push(s); else otherBuckets.push(s);
				}
				for (const g of gameBuckets) {
					merged.push(g);
					if (merged.length >= 6) break;
				}
				for (const o of otherBuckets) {
					if (merged.length >= 6) break;
					merged.push(o);
				}
					// then fill with local recents if still sparse
					if (merged.length < 6) {
						for (const s of filteredLocal) {
							if (!s || !s.label) continue;
							if (seen.has(s.label)) continue;
							seen.add(s.label);
							merged.push(s);
							if (merged.length >= 6) break;
						}
					}
					// if still sparse, try eBay-backed suggestions (only if enabled and term >= 3)
					if (allowServerThisTerm && allowEbayEnv && merged.length < 4) {
						try {
							const r3 = await fetch(`/api/ebay-suggest?q=${encodeURIComponent(q)}`);
							if (r3.ok) {
								const d3 = await r3.json();
								const ebay = (d3 && d3.suggestions) || [];
								for (const s of ebay) {
									const lab = s && s.label;
									if (!lab) continue;
									if (seen.has(lab)) continue;
									seen.add(lab);
									merged.push({ label: lab, source: s.source || 'ebay', category: s.category || null });
									if (merged.length >= 6) break;
								}
							}
						} catch (e) {}
					}
		// Inject caller-provided augmented suggestions (e.g., Collections/Lists), displayed above live suggestions
		let augmented = [];
		try {
			if (typeof augmentSuggestions === 'function') {
				const extra = augmentSuggestions(q);
					if (Array.isArray(extra)) augmented = extra.slice(0, 12);
			}
		} catch (e) {}
			// Always show local sections (augmented) before live; hard cap total at 12
			const finalList = [...augmented, ...merged].slice(0, 12);
		setVisibleSuggestions(finalList);
	setHighlightIndex(-1);
			} catch (e) {
				// ignore
			} finally {
				setLoadingSuggest(false);
			}
		}, 300);
		return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
	}, [q, suggestions]);

	// close suggestions when clicking/touching outside the search bar
	useEffect(() => {
		function handleClickOutside(e) {
			try {
				if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
					setVisibleSuggestions([]);
					setHighlightIndex(-1);
				}
			} catch (err) {}
		}
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('touchstart', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('touchstart', handleClickOutside);
		};
	}, []);

	function submit(e) {
		e && e.preventDefault();
		if (!q) return;
		// simple debounce guard to avoid duplicate rapid submits
		if (submittingRef.current) return;
		submittingRef.current = true;
		try {
			onSearch(q);
		} finally {
			setVisibleSuggestions([]);
			setHelperText(null);
			setHighlightIndex(-1);
			setTimeout(() => { submittingRef.current = false; }, 600);
		}
	}

		function chooseSuggestion(s) {
		if (!s) return;
			// s may be a string or an object { label, category, source, ... }
			if (typeof s === 'object' && s.source && (s.source === 'section' || s.source === 'separator')) {
				return; // non-interactive rows
			}
			const payload = (typeof s === 'string') ? { query: s } : Object.assign({ query: s.label || s }, s);
			// preserve the user's original typed input so the server can tell if they intended CIB/loose, etc.
			try { payload.originalInput = q; } catch (_) {}
		try {
			onSearch(payload);
		} finally {
			setVisibleSuggestions([]);
			setHelperText(null);
			setHighlightIndex(-1);
		}
	}

	function handleKeyDown(e) {
		// navigation through suggestions
		if (e.key === 'ArrowDown') {
			if (visibleSuggestions && visibleSuggestions.length > 0) {
				e.preventDefault();
				setHighlightIndex((prev) => {
					const next = prev + 1;
					return next >= visibleSuggestions.length ? 0 : next;
				});
			}
			return;
		}
		if (e.key === 'ArrowUp') {
			if (visibleSuggestions && visibleSuggestions.length > 0) {
				e.preventDefault();
				setHighlightIndex((prev) => {
					const next = prev - 1;
					return next < 0 ? Math.max(visibleSuggestions.length - 1, 0) : next;
				});
			}
			return;
		}
		if (e.key === 'Enter') {
			if (visibleSuggestions && visibleSuggestions.length > 0 && highlightIndex >= 0 && visibleSuggestions[highlightIndex]) {
				e.preventDefault();
				const selected = visibleSuggestions[highlightIndex];
				chooseSuggestion(selected);
			}
			return;
		}
		if (e.key === 'Escape') {
			setVisibleSuggestions([]);
			setHighlightIndex(-1);
			return;
		}
	}

	function renderHighlighted(item, qstr) {
		const s = item && (item.label || item);
		if (!qstr) return s;
		const idx = String(s).toLowerCase().indexOf(String(qstr).toLowerCase());
		if (idx === -1) return s;
		const pre = s.slice(0, idx);
		const match = s.slice(idx, idx + qstr.length);
		const post = s.slice(idx + qstr.length);
		return (<>{pre}<span className="dr-suggestion-match">{match}</span>{post}</>);
	}

	return (
		<form ref={wrapperRef} className="dr-searchbar" onSubmit={submit} autoComplete="off">
			{showScans ? (
				<div className="dr-scan-actions">
					<button type="button" className="dr-scan-icon" aria-label="Scan barcode" onClick={() => onOpenCamera && onOpenCamera()}><LuScanBarcode size={24} /></button>
					<button type="button" className="dr-photo-icon" aria-label="Image lookup" onClick={() => onOpenImage && onOpenImage()}><RiCameraAiLine  size={24} /></button>
				</div>
			) : null}
			<div className="dr-search-input-wrap" style={{ position: 'relative', flex: 1 }}>
				<input
					placeholder={placeholder}
					value={q}
					onChange={(e) => setQ(e.target.value)}
					onKeyDown={handleKeyDown}
					className="dr-search-input"
					aria-label="Search"
				/>
				<div className={`dr-suggestions ${ (loadingSuggest || (visibleSuggestions && visibleSuggestions.length > 0) || helperText) ? 'open' : '' }`} role="listbox">
					{helperText && !loadingSuggest && <div className="dr-suggest-loading">{helperText}</div>}
								{loadingSuggest && <div className="dr-suggest-loading">Searching...</div>}
								{(!loadingSuggest && visibleSuggestions && visibleSuggestions.length > 0) && (
									visibleSuggestions.map((s, i) => {
										const isSection = typeof s === 'object' && s.source === 'section';
										const isSeparator = typeof s === 'object' && s.source === 'separator';
										if (isSection) {
											return (
												<div key={i} className="dr-suggest-section">{s.label}</div>
											);
										}
										if (isSeparator) {
											return (
												<div key={i} className="dr-suggest-sep" aria-hidden="true" />
											);
										}
										return (
											<button key={i}
												type="button"
												className={`dr-suggestion ${i === highlightIndex ? 'active' : ''}`}
												onMouseEnter={() => setHighlightIndex(i)}
												onClick={() => chooseSuggestion(s)}
											>
												<div className="dr-suggestion-title">{renderHighlighted(s, q)}</div>
												{(() => {
													const parts = [];
													if (s && s.category) parts.push(s.category);
													// detect platform tokens in label as hint
													const label = (s && s.label) || '';
													const pTokens = ['Nintendo Switch','Switch','PS5','PS4','3DS','Wii U','Xbox One','PC','DS'];
													for (const t of pTokens) if (label.includes(t) && !parts.includes(t)) parts.push(t);
													return parts.length ? <div className="dr-suggestion-cat">{parts.join(' • ')}</div> : null;
												})()}
											</button>
										);
									})
								)}
				</div>
			</div>
			<button type="submit" className="dr-search-icon" aria-label="Search"><LuSearch size={20} /></button>
		</form>
	);
}
