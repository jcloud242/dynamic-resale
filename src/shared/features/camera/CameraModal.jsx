import { useEffect, useRef, useState } from "react";
import "../../styles/camera.css";
import { LuScanBarcode, LuSearch } from 'react-icons/lu';
import { MdOutlineMotionPhotosOn, MdMotionPhotosOn } from 'react-icons/md';
import { RiCameraAiLine } from "react-icons/ri";
import { FaWindowClose } from 'react-icons/fa';
// ZXing will be dynamically imported inside the component to avoid module-time issues

export default function CameraModal({ mode = "barcode", onClose, onDetected }) {
	const videoRef = useRef(null);
	const codeReaderRef = useRef(null);
	const [scanning, setScanning] = useState(false);
	const [lastResult, setLastResult] = useState(null);
	const [pendingAutoResult, setPendingAutoResult] = useState(null);
	// buffer for last successful detections to require short repeat-confirmation
	const recentDetectionsRef = useRef([]);
	const canvasRef = useRef(null);
	const [devices, setDevices] = useState([]);
	const [selectedDevice, setSelectedDevice] = useState(null);
	const [error, setError] = useState(null);
	const [restartCount, setRestartCount] = useState(0);
	const [started, setStarted] = useState(false);
	// removed persisted stats for simplicity
	const [showPulse, setShowPulse] = useState(false);
	const autoCaptureRef = useRef(null);
	const autoCaptureStarterRef = useRef(null);
	const isCapturing = useRef(false);
	const [showFailure, setShowFailure] = useState(false);
	const [autoAccepting, setAutoAccepting] = useState(false);
	const autoAcceptTimeoutRef = useRef(null);
	// lightweight scan stats state (kept minimal)
	const [scanStats, setScanStats] = useState({
		attempts: 0,
		successes: 0,
		failures: 0,
	});
	const startedAtRef = useRef(0);
	const failureStreakRef = useRef(0);
	const [GRACE_PERIOD_MS, setGracePeriodMs] = useState(1800);
	const [FAILURE_THRESHOLD, setFailureThreshold] = useState(2);
	const [brightnessHint, setBrightnessHint] = useState(null);
	// accessibility: do not announce by default; allow enabling via toggle
	const [announceResults, setAnnounceResults] = useState(false);
	// visual guides toggle (off by default to reduce clutter)
	const [showGuides, setShowGuides] = useState(false);
	const [showSnap, setShowSnap] = useState(false);
	const isHandlingRef = useRef(false);
	const closingRef = useRef(false);
	// ensure closingRef is reset when modal mounts
	closingRef.current = false;
	// cache pre-warmed ZXing module to avoid dynamic-import latency
	const zxModuleRef = useRef(null);
	const firstStartRef = useRef(true);
	const [currentMode, setCurrentMode] = useState(mode);
	const [shutterActive, setShutterActive] = useState(false);

	// pre-warm ZXing decoder on mount (non-blocking)
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const zx = await import("@zxing/browser");
				if (!cancelled) zxModuleRef.current = zx;
			} catch (e) {
				// ignore pre-warm failures; initScanner will still attempt to import
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		// no persisted stats anymore

		let active = true;
	async function initScanner() {
			try {
				const zx = zxModuleRef.current || (await import("@zxing/browser"));
				const { BrowserMultiFormatReader } = zx;
				const hints = undefined;
				const reader = new BrowserMultiFormatReader(hints);
				codeReaderRef.current = reader;

				const videoInputDevices =
					await BrowserMultiFormatReader.listVideoInputDevices();
				setDevices(videoInputDevices);
				const deviceId =
					selectedDevice ||
					(videoInputDevices.length
						? videoInputDevices[0].deviceId
						: undefined);

	setScanning(true);

				try {
					if (started) {
						reader.decodeFromVideoDevice(
							deviceId,
							videoRef.current,
							(result, err) => {
								if (!active) return;
								if (isHandlingRef.current) return;
								if (result) {
									// Found a code live: process detection but only show confirmed UI when validated
									const text = result.getText();
									isHandlingRef.current = true;
									// allow subsequent detections after a short visual window so scanner remains responsive
									setTimeout(() => {
										if (closingRef.current) return;
										isHandlingRef.current = false;
									}, 350);
									setShowFailure(false);
									setLastResult(text);
									setError(null);
									setBrightnessHint(null);
									if (currentMode === "barcode") {
										// basic sanitization: ignore short or non-numeric scans
										const sanitized = String(text).replace(/[^0-9]/g, "");
										if (sanitized.length < 8) {
											// likely partial/malformed read — ignore
											setAutoAccepting(false);
											isHandlingRef.current = false;
										} else {
											// optional UPC/EAN checksum validation for 12/13/8-digit codes
											const isChecksumValid = validateUpcChecksum(sanitized);
											if (!isChecksumValid) {
												// don't auto-accept immediately; treat as a soft-detection
												// push to recentDetections and require a quick repeat to confirm
												recentDetectionsRef.current.push({
													code: sanitized,
													ts: Date.now(),
												});
												// keep only last 5 entries
												recentDetectionsRef.current =
													recentDetectionsRef.current.slice(-5);
												setAutoAccepting(true);
												// if the same code appears twice within 1200ms, accept it
												const sameRecent = recentDetectionsRef.current.filter(
													(d) =>
														d.code === sanitized && Date.now() - d.ts < 1200
												);
												if (sameRecent.length >= 2) {
													confirmAndClose(sanitized, reader);
												} else {
													// soft success: indicate tentative acceptance but do not show final green check
													setAutoAccepting(true);
													setTimeout(() => {
														if (closingRef.current) return;
														setAutoAccepting(false);
														isHandlingRef.current = false;
													}, 350);
												}
											} else {
												// checksum OK — confirmed detection, show final UI and close
												confirmAndClose(sanitized, reader);
											}
										}
									} else {
										// keep confirm flow for non-barcode modes
										setPendingAutoResult(text);
									}
								} else if (err && !isNotFoundException(err)) {
									// log unexpected errors
									console.error(err);
									setError(err.message || String(err));
								}
							}
						);
					}
				} catch (decodeErr) {
					// Some browsers abort play() for background tabs or auto-play policies
					console.warn("decodeFromVideoDevice threw", decodeErr);
					if (decodeErr && decodeErr.name === "AbortError") {
						setError(
							'It was not possible to play the video. Please ensure the page has camera permission and is visible. Use "Start camera" to retry.'
						);
					} else {
						setError(String(decodeErr));
					}
				}
			} catch (err) {
				console.error("Scanner init failed", err);
				setError(err.message || String(err));
			}
		}
		initScanner();

		function onKey(e) {
			if (e.key === "Escape" || e.key === "Esc") {
				try {
					codeReaderRef.current && codeReaderRef.current.reset();
				} catch (e) {}
				onClose();
			}
		}
		window.addEventListener("keydown", onKey);

		return () => {
			active = false;
			try {
				if (codeReaderRef.current) codeReaderRef.current.reset();
			} catch (e) {}
			window.removeEventListener("keydown", onKey);
		};
	}, [onClose, onDetected, selectedDevice, restartCount]);

	// attempt to auto-start camera where possible (gracefully degrade if blocked)
	useEffect(() => {
		// start scanning automatically; if browser blocks autoplay, UI will still show errors
		try {
			setStarted(true);
			// make firstStart less aggressive since we're auto-starting
			firstStartRef.current = false;
			startedAtRef.current = Date.now();
			setRestartCount((c) => c + 1);
		} catch (e) {}
	}, []);

	// When switching modes inside the modal, clear barcode-specific transient UI
	// (errors, failure messages, last scan) so photo mode doesn't show stale
	// "No barcode found" or similar messages from prior barcode activity.
	useEffect(() => {
		if (currentMode === "photo" || currentMode === "image") {
			try {
				setError(null);
				setShowFailure(false);
				setLastResult(null);
				setPendingAutoResult(null);
				setAutoAccepting(false);
			} catch (e) {}
		}
	}, [currentMode]);

	// clear visual success states when scanning stops or modal not started
	useEffect(() => {
		if (!started || !scanning) {
			setAutoAccepting(false);
			setShowPulse(false);
			// do not clear lastResult immediately to allow transient display, but clear after short delay
			const t = setTimeout(() => setLastResult(null), 350);
			return () => clearTimeout(t);
		}
		return;
	}, [started, scanning]);

	function clearStats() {
		setScanStats({ attempts: 0, successes: 0, failures: 0 });
		try {
			localStorage.removeItem("dr_scan_stats");
		} catch (e) {}
	}

	// auto-capture loop while scanning and started — only for barcode mode
	useEffect(() => {
		if (!started || !scanning) return;
		// if not in barcode mode, ensure any existing timers are cleared and do nothing
		if (currentMode !== "barcode") {
			if (autoCaptureStarterRef.current) {
				clearTimeout(autoCaptureStarterRef.current);
				autoCaptureStarterRef.current = null;
			}
			if (autoCaptureRef.current) {
				clearInterval(autoCaptureRef.current);
				autoCaptureRef.current = null;
			}
			return;
		}
		// clear any previous timers
		if (autoCaptureStarterRef.current) {
			clearTimeout(autoCaptureStarterRef.current);
			autoCaptureStarterRef.current = null;
		}
		if (autoCaptureRef.current) {
			clearInterval(autoCaptureRef.current);
			autoCaptureRef.current = null;
		}
		// wait a brief warmup so user can position barcode and camera can stabilize
		autoCaptureStarterRef.current = setTimeout(() => {
			if (autoCaptureRef.current) clearInterval(autoCaptureRef.current);
			// slightly shorter warmup and faster interval to be more responsive on first use
			autoCaptureRef.current = setInterval(() => {
				if (pendingAutoResult || autoAccepting) return; // pause if user deciding or auto-accepting
				// enforce grace period so user has time to position barcode
				const startedAt = startedAtRef.current || 0;
				if (Date.now() - startedAt < GRACE_PERIOD_MS) return;
				// try capture (captureFrame will guard overlapping and video readiness)
				captureFrame();
			}, 700);
		}, 350);

		return () => {
			if (autoCaptureStarterRef.current) {
				clearTimeout(autoCaptureStarterRef.current);
				autoCaptureStarterRef.current = null;
			}
			if (autoCaptureRef.current) {
				clearInterval(autoCaptureRef.current);
				autoCaptureRef.current = null;
			}
		};
	}, [started, scanning, pendingAutoResult, currentMode]);

	async function captureFrame() {
		// Defensive guard: only allow captureFrame for barcode scanning mode.
		if (currentMode !== "barcode") return;
		// single-capture guard
		if (isCapturing.current) return;
		isCapturing.current = true;
		try {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			if (!video || !canvas) return;
			// ensure the video has dimensions (video may not be ready yet)
			await waitForVideoFrame(video, 1000);
			if (!video.videoWidth || !video.videoHeight) {
				// don't treat as a failed attempt; let the next interval retry
				isCapturing.current = false;
				return;
			}
			// basic brightness check on the captured canvas
			try {
				const tmpCheck = document.createElement("canvas");
				tmpCheck.width = canvas.width;
				tmpCheck.height = canvas.height;
				const cctx = tmpCheck.getContext("2d");
				cctx.drawImage(canvas, 0, 0);
				const imgd = cctx.getImageData(
					0,
					0,
					Math.min(200, tmpCheck.width),
					Math.min(120, tmpCheck.height)
				);
				let tot = 0;
				for (let i = 0; i < imgd.data.length; i += 4) {
					const r = imgd.data[i],
						g = imgd.data[i + 1],
						b = imgd.data[i + 2];
					// luminance
					tot += 0.2126 * r + 0.7152 * g + 0.0722 * b;
				}
				const avg = tot / (imgd.data.length / 4);
				if (avg < 40)
					setBrightnessHint("Low light — try moving to a brighter area");
				else setBrightnessHint(null);
			} catch (e) {
				setBrightnessHint(null);
			}
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext("2d");
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			// try multiple crops and downsample levels
			const crops = [];
			// full frame
			crops.push({ x: 0, y: 0, w: canvas.width, h: canvas.height });
			// center crop
			const cw = Math.floor(canvas.width * 0.6);
			const ch = Math.floor(canvas.height * 0.4);
			crops.push({
				x: Math.floor((canvas.width - cw) / 2),
				y: Math.floor((canvas.height - ch) / 2),
				w: cw,
				h: ch,
			});
			// left and right wider crops to catch off-center barcodes
			const wWide = Math.floor(canvas.width * 0.7);
			const hWide = Math.floor(canvas.height * 0.45);
			crops.push({
				x: Math.floor((canvas.width - wWide) * 0.02),
				y: Math.floor((canvas.height - hWide) / 2),
				w: wWide,
				h: hWide,
			});
			crops.push({
				x: Math.floor(canvas.width - wWide - (canvas.width - wWide) * 0.02),
				y: Math.floor((canvas.height - hWide) / 2),
				w: wWide,
				h: hWide,
			});
			// small center (zoom)
			const cw2 = Math.floor(canvas.width * 0.4);
			const ch2 = Math.floor(canvas.height * 0.25);
			// mark this crop as 'preferRotate' for milder CPU rotation attempts
			crops.push({
				x: Math.floor((canvas.width - cw2) / 2),
				y: Math.floor((canvas.height - ch2) / 2),
				w: cw2,
				h: ch2,
				preferRotate: true,
			});

			const zx = await import("@zxing/browser");
			const { BrowserMultiFormatReader } = zx;
			const reader = new BrowserMultiFormatReader();
			let finalResult = null;
			for (const c of crops) {
				// downsample each crop to a smaller temp canvas for speed
				const tmp = document.createElement("canvas");
				const scale = Math.min(1200 / c.w, 1200 / c.h, 1);
				tmp.width = Math.max(360, Math.floor(c.w * scale));
				tmp.height = Math.max(160, Math.floor(c.h * scale));
				const tctx = tmp.getContext("2d");
				tctx.drawImage(canvas, c.x, c.y, c.w, c.h, 0, 0, tmp.width, tmp.height);
				try {
					if (typeof reader.decodeFromImage === "function") {
						const dataUrl = tmp.toDataURL("image/png");
						let r = await reader.decodeFromImage(undefined, dataUrl);
						if (!r && c.preferRotate) {
							// try mild rotated attempts (±7°) only for the small center crop
							for (const ang of [7, -7]) {
								try {
									const rot = document.createElement("canvas");
									const rw = tmp.width,
										rh = tmp.height;
									rot.width = rw;
									rot.height = rh;
									const rctx = rot.getContext("2d");
									rctx.translate(rw / 2, rh / 2);
									rctx.rotate((ang * Math.PI) / 180);
									rctx.drawImage(tmp, -rw / 2, -rh / 2);
									const rdata = rot.toDataURL("image/png");
									r = await reader.decodeFromImage(undefined, rdata);
									if (r) break;
								} catch (e) {
									/* ignore */
								}
							}
						}
						if (r) {
							finalResult = r;
							// if guides are on, check centroid of result points and trigger snap highlight
							if (showGuides) {
								try {
									const pts =
										(r.getResultPoints && r.getResultPoints()) ||
										r.resultPoints ||
										null;
									if (pts && pts.length) {
										let sx = 0,
											sy = 0;
										for (const p of pts) {
											const x =
												typeof p.getX === "function" ? p.getX() : p.x ?? p[0];
											const y =
												typeof p.getY === "function" ? p.getY() : p.y ?? p[1];
											sx += x;
											sy += y;
										}
										const cx = sx / pts.length;
										const cy = sy / pts.length;
										const dx = cx - tmp.width / 2;
										const dy = cy - tmp.height / 2;
										const dist = Math.sqrt(dx * dx + dy * dy);
										const threshold = Math.min(tmp.width, tmp.height) * 0.22;
										if (dist < threshold) {
											setShowSnap(true);
											setTimeout(() => {
												if (closingRef.current) return;
												setShowSnap(false);
											}, 700);
										}
									}
								} catch (e) {
									/* non-fatal */
								}
							}
						}
					} else if (typeof reader.decodeFromCanvas === "function") {
						let r = await reader.decodeFromCanvas(tmp);
						if (!r && c.preferRotate) {
							// try mild rotated canvas decodes only for the small center crop
							for (const ang of [7, -7]) {
								try {
									const rot = document.createElement("canvas");
									const rw = tmp.width,
										rh = tmp.height;
									rot.width = rw;
									rot.height = rh;
									const rctx = rot.getContext("2d");
									rctx.translate(rw / 2, rh / 2);
									rctx.rotate((ang * Math.PI) / 180);
									rctx.drawImage(tmp, -rw / 2, -rh / 2);
									const rr = await reader.decodeFromCanvas(rot);
									if (rr) {
										r = rr;
										break;
									}
								} catch (e) {
									/* ignore */
								}
							}
						}
						if (r) {
							finalResult = r;
							if (showGuides) {
								try {
									const pts =
										(r.getResultPoints && r.getResultPoints()) ||
										r.resultPoints ||
										null;
									if (pts && pts.length) {
										let sx = 0,
											sy = 0;
										for (const p of pts) {
											const x =
												typeof p.getX === "function" ? p.getX() : p.x ?? p[0];
											const y =
												typeof p.getY === "function" ? p.getY() : p.y ?? p[1];
											sx += x;
											sy += y;
										}
										const cx = sx / pts.length;
										const cy = sy / pts.length;
										const dx = cx - tmp.width / 2;
										const dy = cy - tmp.height / 2;
										const dist = Math.sqrt(dx * dx + dy * dy);
										const threshold = Math.min(tmp.width, tmp.height) * 0.22;
										if (dist < threshold) {
											setShowSnap(true);
											setTimeout(() => {
												if (closingRef.current) return;
												setShowSnap(false);
											}, 700);
										}
									}
								} catch (e) {
									/* non-fatal */
								}
							}
						}
					}
				} catch (e) {
					/* decode attempt failed for this crop; continue */
				}
			}
			if (!finalResult) {
				failureStreakRef.current = Math.min(999, failureStreakRef.current + 1);
				setScanStats((s) => ({ ...s, failures: s.failures + 1 }));
				if (failureStreakRef.current >= FAILURE_THRESHOLD) {
					setShowFailure(true);
				}
			} else {
				setScanStats((s) => ({ ...s, successes: s.successes + 1 }));
			}
		} finally {
			isCapturing.current = false;
		}
	}

	function isNotFoundException(err) {
		return (
			(err && err.name === "NotFoundException") ||
			String(err).indexOf("NotFoundException") !== -1
		);
	}

	function validateUpcChecksum(code) {
		// Simple UPC-A/EAN-13 checksum validation; accept also 8-digit EAN-8
		if (!code) return false;
		if (code.length === 8) return true; // skip strict check for EAN-8
		const digits = String(code).split("").map((d) => Number(d));
		if (digits.length < 12) return false;
		const chk = digits[digits.length - 1];
		const body = digits.slice(0, digits.length - 1);
		let sum = 0;
		for (let i = 0; i < body.length; i++) {
			sum += body[i] * (i % 2 === 0 ? 3 : 1);
		}
		const calc = (10 - (sum % 10)) % 10;
		return calc === chk;
	}

	function confirmAndClose(text, reader) {
		try {
			setShowPulse(true);
			setTimeout(() => setShowPulse(false), 450);
			setAutoAccepting(false);
			setShowFailure(false);
			if (onDetected) onDetected(text);
		} finally {
			try { reader && reader.reset && reader.reset(); } catch (e) {}
			closingRef.current = true;
			onClose && onClose();
		}
	}

	async function waitForVideoFrame(video, timeoutMs) {
		const t0 = Date.now();
		return new Promise((resolve, reject) => {
			function check() {
				if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
					resolve();
				} else if (Date.now() - t0 > timeoutMs) {
					resolve(); // resolve rather than reject to let caller decide
				} else {
					requestAnimationFrame(check);
				}
			}
			check();
		});
	}

	return (
		<div className="dr-camera-overlay" role="dialog" aria-modal>
			<div className="dr-camera-modal">
				<div className="dr-camera-header">
					<div className="dr-header-left">
						<button className={`dr-mode-icon ${currentMode === 'barcode' ? 'active' : ''}`} onClick={() => setCurrentMode('barcode')} title="Barcode">
							<LuScanBarcode size={18} />
						</button>
						<button className={`dr-mode-icon ${currentMode === 'photo' ? 'active' : ''}`} onClick={() => setCurrentMode('photo')} title="Photo">
							<RiCameraAiLine size={18} />
						</button>
						<button className={`dr-mode-icon ${currentMode === 'image' ? 'active' : ''}`} onClick={() => setCurrentMode('image')} title="Image">
							<LuSearch size={18} />
						</button>
					</div>
					<div className="dr-camera-title">Scan</div>
					<button className="dr-camera-close" onClick={onClose} aria-label="Close camera">
						<FaWindowClose />
					</button>
				</div>
				<div className={`dr-camera-body`}>
					<div className={`dr-camera-video-wrap ${showPulse ? 'dr-pulse' : ''} ${showSnap ? 'snap' : ''} ${showFailure ? 'dr-fail' : ''} ${autoAccepting ? 'dr-success' : ''} mode-${currentMode}`}>
						<video ref={videoRef} className="dr-camera-video" autoPlay playsInline />
						<div className="dr-frame-mask">
							<div className="dr-frame-inner" aria-hidden></div>
							<div className={`dr-target-overlay`}>
								<div className={`dr-target-center ${autoAccepting ? 'dr-good' : showFailure ? 'dr-bad' : ''}`}></div>
							</div>
						</div>
						<canvas ref={canvasRef} style={{ display: 'none' }} />
					</div>
					{error && <div className="dr-camera-error">{String(error)}</div>}
					{brightnessHint && <div className="dr-camera-error">{String(brightnessHint)}</div>}
					<div className="dr-shutter-wrap">
						<button
							className={`dr-shutter ${shutterActive ? 'shutter-active' : ''}`}
							onClick={() => {
								setShutterActive(true);
								setTimeout(() => setShutterActive(false), 160);
								// For photo/image modes we might capture still; for barcode, we trigger an immediate captureFrame attempt
								if (currentMode === 'barcode') captureFrame();
							}}
							aria-label="Capture"
						>
							<MdMotionPhotosOn size={28} />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
