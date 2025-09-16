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

  useEffect(() => {
  // no persisted stats anymore

    let active = true;
    async function initScanner() {
      try {
        const zx = await import('@zxing/browser');
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
              if (result) {
                // Found a code live: show success pulse/overlay and auto-accept for barcode mode
                const text = result.getText();
                setShowPulse(true);
                setShowFailure(false);
                setLastResult(text);
                  setError(null);
                  setBrightnessHint(null);
                try { reader.reset(); } catch (e) {}
                if (mode === 'barcode') {
                  setAutoAccepting(true);
                  try { onDetected({ type: 'barcode', value: text }); } catch (e) {}
                    setError(null);
                    setBrightnessHint(null);
                  if (autoAcceptTimeoutRef.current) clearTimeout(autoAcceptTimeoutRef.current);
                  autoAcceptTimeoutRef.current = setTimeout(() => {
                    try { onClose(); } catch (e) {}
                    setAutoAccepting(false);
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

    return () => {
      active = false;
      try {
        if (codeReaderRef.current) codeReaderRef.current.reset();
      } catch (e) {}
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
      autoCaptureRef.current = setInterval(() => {
    if (pendingAutoResult || autoAccepting) return; // pause if user deciding or auto-accepting
  // enforce grace period so user has time to position barcode
    const startedAt = startedAtRef.current || 0;
    if (Date.now() - startedAt < GRACE_PERIOD_MS) return;
  // try capture (captureFrame will guard overlapping and video readiness)
  captureFrame();
      }, 1200);
    }, 700);

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
      // small center (zoom)
      const cw2 = Math.floor(canvas.width * 0.4);
      const ch2 = Math.floor(canvas.height * 0.2);
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
            const r = await reader.decodeFromImage(undefined, dataUrl);
            if (r) { finalResult = r; }
          } else if (typeof reader.decodeFromCanvas === 'function') {
            const r = await reader.decodeFromCanvas(tmp);
            if (r) { finalResult = r; }
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
        setShowPulse(true);
        // ensure success overlay uses autoAccepting flag for immediate display
        setAutoAccepting(true);
        try { onDetected({ type: 'barcode', value: text }); } catch (e) {}
        try { reader.reset(); } catch (e) {}
        if (autoAcceptTimeoutRef.current) clearTimeout(autoAcceptTimeoutRef.current);
        autoAcceptTimeoutRef.current = setTimeout(() => {
          try { onClose(); } catch (e) {}
          setAutoAccepting(false);
          setShowPulse(false);
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
          <div className={`dr-camera-video-wrap ${lastResult ? 'dr-success' : ''} ${showPulse ? 'dr-pulse' : ''}`}>
            <video ref={videoRef} className="dr-camera-video" playsInline muted />
            {!started && (
              <div className="dr-start-overlay">
                <button className="dr-start-btn" aria-label="Start camera" onClick={() => { setError(null); setStarted(true); setRestartCount(c=>c+1); }}>Start camera</button>
              </div>
            )}
            <div className="dr-target-overlay">
              <div className={`dr-target-center ${showFailure ? 'dr-bad' : ''} ${showPulse ? 'dr-good' : ''}`} aria-hidden>
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
