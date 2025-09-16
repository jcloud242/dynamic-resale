import React, { useEffect, useRef, useState } from 'react';
import './camera.css';
// ZXing will be dynamically imported inside the component to avoid module-time issues

export default function CameraModal({ mode = 'barcode', onClose, onDetected }) {
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [pendingAutoResult, setPendingAutoResult] = useState(null);
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
  const startedAtRef = useRef(0);
  const failureStreakRef = useRef(0);
  const [GRACE_PERIOD_MS, setGracePeriodMs] = useState(1800);
  const [FAILURE_THRESHOLD, setFailureThreshold] = useState(2);
  const [brightnessHint, setBrightnessHint] = useState(null);
  // accessibility: do not announce by default; allow enabling via toggle
  const [announceResults, setAnnounceResults] = useState(false);
  // visual guides toggle (off by default)
  const [showGuides, setShowGuides] = useState(false);
  const [showSnap, setShowSnap] = useState(false);
  const isHandlingRef = useRef(false);
  // cache pre-warmed ZXing module to avoid dynamic-import latency
  const zxModuleRef = useRef(null);
  const firstStartRef = useRef(true);

  // pre-warm ZXing decoder on mount (non-blocking)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const zx = await import('@zxing/browser');
        if (!cancelled) zxModuleRef.current = zx;
      } catch (e) {
        // ignore pre-warm failures; initScanner will still attempt to import
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
  // no persisted stats anymore

    let active = true;
    async function initScanner() {
      try {
        const zx = zxModuleRef.current || await import('@zxing/browser');
        const { BrowserMultiFormatReader } = zx;
        const hints = undefined;
        const reader = new BrowserMultiFormatReader(hints);
        codeReaderRef.current = reader;

        const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(videoInputDevices);
        const deviceId = selectedDevice || (videoInputDevices.length ? videoInputDevices[0].deviceId : undefined);

        setScanning(true);

        try {
          if (started) {
            reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
              if (!active) return;
              if (isHandlingRef.current) return;
              if (result) {
                // Found a code live: show success pulse/overlay and auto-accept for barcode mode
                const text = result.getText();
                isHandlingRef.current = true;
                setShowPulse(true);
                // allow subsequent detections after a short visual window so scanner remains responsive
                setTimeout(() => { isHandlingRef.current = false; }, 350);
                setShowFailure(false);
                setLastResult(text);
                  setError(null);
                  setBrightnessHint(null);
                if (mode === 'barcode') {
                  setAutoAccepting(true);
                  try { onDetected({ type: 'barcode', value: text }); } catch (e) {}
                    setError(null);
                    setBrightnessHint(null);
                  if (autoAcceptTimeoutRef.current) clearTimeout(autoAcceptTimeoutRef.current);
                  autoAcceptTimeoutRef.current = setTimeout(() => {
                    try { onClose(); } catch (e) {}
                    setAutoAccepting(false);
                    isHandlingRef.current = false;
                  }, 900);
                } else {
                  // keep confirm flow for non-barcode modes
                  setPendingAutoResult(text);
                }
              } else if (err && !isNotFoundException(err)) {
                // log unexpected errors
                console.error(err);
                setError(err.message || String(err));
              }
            });
          }
        } catch (decodeErr) {
          // Some browsers abort play() for background tabs or auto-play policies
          console.warn('decodeFromVideoDevice threw', decodeErr);
          if (decodeErr && decodeErr.name === 'AbortError') {
            setError('It was not possible to play the video. Please ensure the page has camera permission and is visible. Use "Start camera" to retry.');
          } else {
            setError(String(decodeErr));
          }
        }
      } catch (err) {
        console.error('Scanner init failed', err);
        setError(err.message || String(err));
      }
    }
  initScanner();

  function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        try { codeReaderRef.current && codeReaderRef.current.reset(); } catch(e){}
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);

    return () => {
      active = false;
      try {
        if (codeReaderRef.current) codeReaderRef.current.reset();
      } catch (e) {}
  window.removeEventListener('keydown', onKey);
    };
  }, [onClose, onDetected, selectedDevice, restartCount]);

  function clearStats() {
    setScanStats({ attempts: 0, successes: 0, failures: 0 });
    try { localStorage.removeItem('dr_scan_stats'); } catch (e) {}
  }

  // auto-capture loop while scanning and started
  useEffect(() => {
    if (!started || !scanning) return;
    // clear any previous timers
    if (autoCaptureStarterRef.current) { clearTimeout(autoCaptureStarterRef.current); autoCaptureStarterRef.current = null; }
    if (autoCaptureRef.current) { clearInterval(autoCaptureRef.current); autoCaptureRef.current = null; }
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
      if (autoCaptureStarterRef.current) { clearTimeout(autoCaptureStarterRef.current); autoCaptureStarterRef.current = null; }
      if (autoCaptureRef.current) { clearInterval(autoCaptureRef.current); autoCaptureRef.current = null; }
    };
  }, [started, scanning, pendingAutoResult]);

  async function captureFrame() {
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
        const tmpCheck = document.createElement('canvas');
        tmpCheck.width = canvas.width;
        tmpCheck.height = canvas.height;
        const cctx = tmpCheck.getContext('2d');
        cctx.drawImage(canvas, 0, 0);
        const imgd = cctx.getImageData(0, 0, Math.min(200, tmpCheck.width), Math.min(120, tmpCheck.height));
        let tot = 0;
        for (let i = 0; i < imgd.data.length; i += 4) {
          const r = imgd.data[i], g = imgd.data[i+1], b = imgd.data[i+2];
          // luminance
          tot += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        const avg = tot / (imgd.data.length / 4);
        if (avg < 40) setBrightnessHint('Low light — try moving to a brighter area'); else setBrightnessHint(null);
      } catch (e) {
        setBrightnessHint(null);
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // try multiple crops and downsample levels
      const crops = [];
      // full frame
      crops.push({ x: 0, y: 0, w: canvas.width, h: canvas.height });
  // center crop
  const cw = Math.floor(canvas.width * 0.6);
  const ch = Math.floor(canvas.height * 0.4);
  crops.push({ x: Math.floor((canvas.width - cw) / 2), y: Math.floor((canvas.height - ch) / 2), w: cw, h: ch });
  // left and right wider crops to catch off-center barcodes
  const wWide = Math.floor(canvas.width * 0.7);
  const hWide = Math.floor(canvas.height * 0.45);
  crops.push({ x: Math.floor((canvas.width - wWide) * 0.02), y: Math.floor((canvas.height - hWide) / 2), w: wWide, h: hWide });
  crops.push({ x: Math.floor(canvas.width - wWide - (canvas.width - wWide) * 0.02), y: Math.floor((canvas.height - hWide) / 2), w: wWide, h: hWide });
  // small center (zoom)
  const cw2 = Math.floor(canvas.width * 0.4);
  const ch2 = Math.floor(canvas.height * 0.25);
  crops.push({ x: Math.floor((canvas.width - cw2) / 2), y: Math.floor((canvas.height - ch2) / 2), w: cw2, h: ch2 });

      const zx = await import('@zxing/browser');
      const { BrowserMultiFormatReader } = zx;
      const reader = new BrowserMultiFormatReader();
  let finalResult = null;
  for (const c of crops) {
        // downsample each crop to a smaller temp canvas for speed
        const tmp = document.createElement('canvas');
  const scale = Math.min(1200 / c.w, 1200 / c.h, 1);
  tmp.width = Math.max(360, Math.floor(c.w * scale));
  tmp.height = Math.max(160, Math.floor(c.h * scale));
        const tctx = tmp.getContext('2d');
        tctx.drawImage(canvas, c.x, c.y, c.w, c.h, 0, 0, tmp.width, tmp.height);
        try {
          if (typeof reader.decodeFromImage === 'function') {
            const dataUrl = tmp.toDataURL('image/png');
            let r = await reader.decodeFromImage(undefined, dataUrl);
            if (!r) {
              // try rotated attempts (mild angles) for tilted barcodes
              for (const ang of [7, -7, 14, -14]) {
                try {
                  const rot = document.createElement('canvas');
                  const rw = tmp.width, rh = tmp.height;
                  rot.width = rw; rot.height = rh;
                  const rctx = rot.getContext('2d');
                  rctx.translate(rw/2, rh/2);
                  rctx.rotate((ang * Math.PI) / 180);
                  rctx.drawImage(tmp, -rw/2, -rh/2);
                  const rdata = rot.toDataURL('image/png');
                  r = await reader.decodeFromImage(undefined, rdata);
                  if (r) break;
                } catch (e) { /* ignore */ }
              }
            }
            if (r) {
              finalResult = r;
              // if guides are on, check centroid of result points and trigger snap highlight
              if (showGuides) {
                try {
                  const pts = (r.getResultPoints && r.getResultPoints()) || r.resultPoints || null;
                  if (pts && pts.length) {
                    let sx = 0, sy = 0;
                    for (const p of pts) {
                      const x = (typeof p.getX === 'function') ? p.getX() : (p.x ?? p[0]);
                      const y = (typeof p.getY === 'function') ? p.getY() : (p.y ?? p[1]);
                      sx += x; sy += y;
                    }
                    const cx = sx / pts.length;
                    const cy = sy / pts.length;
                    const dx = cx - tmp.width / 2;
                    const dy = cy - tmp.height / 2;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const threshold = Math.min(tmp.width, tmp.height) * 0.22;
                    if (dist < threshold) {
                      setShowSnap(true);
                      setTimeout(() => setShowSnap(false), 700);
                    }
                  }
                } catch (e) { /* non-fatal */ }
              }
            }
          } else if (typeof reader.decodeFromCanvas === 'function') {
            let r = await reader.decodeFromCanvas(tmp);
            if (!r) {
              // try rotated canvas decodes
              for (const ang of [7, -7, 14, -14]) {
                try {
                  const rot = document.createElement('canvas');
                  const rw = tmp.width, rh = tmp.height;
                  rot.width = rw; rot.height = rh;
                  const rctx = rot.getContext('2d');
                  rctx.translate(rw/2, rh/2);
                  rctx.rotate((ang * Math.PI) / 180);
                  rctx.drawImage(tmp, -rw/2, -rh/2);
                  const rr = await reader.decodeFromCanvas(rot);
                  if (rr) { r = rr; break; }
                } catch (e) { /* ignore */ }
              }
            }
            if (r) {
              finalResult = r;
              if (showGuides) {
                try {
                  const pts = (r.getResultPoints && r.getResultPoints()) || r.resultPoints || null;
                  if (pts && pts.length) {
                    let sx = 0, sy = 0;
                    for (const p of pts) {
                      const x = (typeof p.getX === 'function') ? p.getX() : (p.x ?? p[0]);
                      const y = (typeof p.getY === 'function') ? p.getY() : (p.y ?? p[1]);
                      sx += x; sy += y;
                    }
                    const cx = sx / pts.length;
                    const cy = sy / pts.length;
                    const dx = cx - tmp.width / 2;
                    const dy = cy - tmp.height / 2;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const threshold = Math.min(tmp.width, tmp.height) * 0.22;
                    if (dist < threshold) {
                      setShowSnap(true);
                      setTimeout(() => setShowSnap(false), 700);
                    }
                  }
                } catch (e) { /* non-fatal */ }
              }
            }
          }
        } catch (err) {
          if (!isNotFoundException(err)) console.warn('decode attempt error', err);
        }
        if (finalResult) break;
      }

      if (finalResult) {
        const text = finalResult.getText();
        // clear any visible errors/hints immediately so UI flips to success without delay
        setError(null);
        setBrightnessHint(null);
        setShowFailure(false);
        // success: persist and reset failure streak
        failureStreakRef.current = 0;
        setScanStats(s => {
          const next = { ...s, successes: s.successes + 1 };
          try { localStorage.setItem('dr_scan_stats', JSON.stringify(next)); } catch (e) {}
          return next;
        });
        // show pulse and immediately show success overlay/card
        setLastResult(text);
        // optionally announce for screen readers if enabled (disabled by default)
        if (announceResults && typeof window !== 'undefined') {
          const live = document.getElementById('dr-aria-live');
          if (live) live.textContent = `Scanned ${text}`;
        }
  setShowPulse(true);
  isHandlingRef.current = true;
  // quick release so subsequent scans can be attempted while still showing UI feedback
  setTimeout(() => { isHandlingRef.current = false; }, 350);
        // ensure success overlay uses autoAccepting flag for immediate display
        setAutoAccepting(true);
        try { onDetected({ type: 'barcode', value: text }); } catch (e) {}
        try { reader.reset(); } catch (e) {}
        if (autoAcceptTimeoutRef.current) clearTimeout(autoAcceptTimeoutRef.current);
        autoAcceptTimeoutRef.current = setTimeout(() => {
          try { onClose(); } catch (e) {}
          setAutoAccepting(false);
          setShowPulse(false);
          isHandlingRef.current = false;
        }, 900);
        return;
      }
      // failure: increment failure streak and only show error after configured threshold
      failureStreakRef.current = (failureStreakRef.current || 0) + 1;
      if (failureStreakRef.current >= FAILURE_THRESHOLD) {
        setShowFailure(true);
        setError('No barcode found — try centering the barcode inside the frame');
      }
    } catch (err) {
      console.error('captureFrame failed', err);
    }
    finally {
      isCapturing.current = false;
    }
  }

  // helper to detect ZXing NotFoundException safely
  function isNotFoundException(err) {
    if (!err) return false;
    if (typeof err === 'object' && err.name === 'NotFoundException') return true;
    try {
      return String(err).includes('NotFoundException');
    } catch (e) {
      return false;
    }
  }

  // wait for at least one video frame to be available (returns after timeout ms)
  function waitForVideoFrame(videoEl, timeout = 500) {
    return new Promise((resolve) => {
      if (!videoEl) return resolve(false);
      if (videoEl.videoWidth && videoEl.videoHeight) return resolve(true);
      let resolved = false;
      const finish = (ok) => { if (!resolved) { resolved = true; resolve(ok); } };
      // modern API
      if (typeof videoEl.requestVideoFrameCallback === 'function') {
        try {
          videoEl.requestVideoFrameCallback(() => finish(true));
        } catch (e) {
          // fall through
        }
      }
      // fallback: poll until timeout
      const start = Date.now();
      const iv = setInterval(() => {
        if (videoEl.videoWidth && videoEl.videoHeight) {
          clearInterval(iv);
          finish(true);
        } else if (Date.now() - start > timeout) {
          clearInterval(iv);
          finish(false);
        }
      }, 80);
    });
  }

  const bodySuccessClass = (autoAccepting || lastResult) ? 'dr-success' : '';

  return (
    <div className="dr-camera-overlay" role="dialog" aria-modal="true" aria-label={mode === 'barcode' ? 'Barcode scanner' : 'Image capture'}>
      <div className={`dr-camera-modal`}>
        <div className="dr-camera-header">
          <div>{mode === 'barcode' ? 'Barcode Scanner' : 'Image Capture'}</div>
          <button aria-label="Close camera" onClick={() => { try { codeReaderRef.current && codeReaderRef.current.reset(); } catch(e){}; onClose(); }}>Close</button>
        </div>
        <div className={`dr-camera-body ${bodySuccessClass}`}>
          {/* guides toggle (off by default) */}
          <div className="dr-guides-toggle">
            <button className="dr-guides-btn" onClick={() => setShowGuides(s => !s)} aria-pressed={showGuides}>{showGuides ? 'Hide guides' : 'Show guides'}</button>
          </div>
          <div className={`dr-camera-video-wrap ${lastResult ? 'dr-success' : ''} ${showPulse ? 'dr-pulse' : ''}`}>
            {/* optional guides overlay */}
            {showGuides && (
              <div className="dr-guides-overlay" aria-hidden>
                <div className="dr-guides-line" style={{top:'18%',left:'6%',right:'6%',height:'1px'}} />
                <div className="dr-guides-label" style={{top:'16%',left:'8%'}}>Top guide</div>
                <div className="dr-guides-line" style={{top:'50%',left:'8%',right:'8%',height:'1px'}} />
                <div className="dr-guides-label" style={{top:'48%',left:'8%'}}>Center</div>
                <div className="dr-guides-line" style={{bottom:'18%',left:'6%',right:'6%',height:'1px'}} />
                <div className="dr-guides-label" style={{bottom:'16%',left:'8%'}}>Bottom</div>
              </div>
            )}
            <video ref={videoRef} className="dr-camera-video" playsInline muted />
            {!started && (
              <div className="dr-start-overlay">
                <button className="dr-start-btn" aria-label="Start camera" onClick={() => {
                  setError(null);
                  setStarted(true);
                  // on first start be more aggressive: reduce warmup by setting startedAt slightly in the past
                  if (firstStartRef.current) {
                    startedAtRef.current = Date.now() - 700; // effectively ~800ms warmup left
                    firstStartRef.current = false;
                  } else {
                    startedAtRef.current = Date.now();
                  }
                  setRestartCount(c=>c+1);
                  setTimeout(() => { try { captureFrame(); } catch(e){} }, 250);
                }}>Start camera</button>
              </div>
            )}
            <div className="dr-target-overlay">
              <div className={`dr-target-center ${showFailure ? 'dr-bad' : ''} ${showPulse ? 'dr-good' : ''} ${showSnap ? 'snap' : ''}`} aria-hidden>
                <span className="dr-check" aria-hidden>{(showPulse || lastResult) ? '✓' : ''}</span>
              </div>
            </div>
          </div>
          <div className="dr-camera-instructions">{scanning ? 'Scanning for barcodes...' : lastResult ? `Found: ${lastResult}` : 'No barcode yet'}</div>
          {pendingAutoResult && (
            <div className="dr-auto-result">
              <div>Detected: {pendingAutoResult}</div>
              <div className="dr-auto-actions">
                <button onClick={() => {
                  // accept result
                  try { onDetected({ type: 'barcode', value: pendingAutoResult }); } catch(e){}
                  setPendingAutoResult(null);
                  onClose();
                }}>Use result</button>
                <button onClick={() => {
                  // continue scanning: reopen reader
                  console.log('User chose to continue scanning');
                  setPendingAutoResult(null);
                  setLastResult(null);
                  setError(null);
                  // bump restartCount to force scanner re-init in effect
                  setRestartCount((c) => c + 1);
                  setScanning(true);
                }}>Continue scanning</button>
              </div>
            </div>
          )}
          {/* device selector removed to simplify UX */}
          {error && <div className="dr-camera-error">{error}</div>}
          {brightnessHint && <div className="dr-camera-hint">{brightnessHint}</div>}
          {autoAccepting && (
            <div className="dr-success-overlay">
              <div className="dr-success-card">Scanned: {lastResult}</div>
            </div>
          )}
        </div>
        <div className="dr-camera-actions">
          <button onClick={() => { 
            // simulate fallback for testing
            onDetected({ type: 'barcode', value: '012345678905' });
            onClose();
          }} className="dr-camera-btn">Simulate</button>
        </div>
        <canvas ref={canvasRef} style={{display:'none'}} />
      </div>
    </div>
  );
}

// end of CameraModal
