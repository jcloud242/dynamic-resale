import { useEffect, useRef, useState } from "react";
import { LuInfo } from "react-icons/lu";
import { MdClose } from "react-icons/md";

// Simple global toast that listens for window 'dr_toast' events
// Usage: window.dispatchEvent(new CustomEvent('dr_toast', { detail: { message: 'Added to ...', variant: 'info', duration: 2000 } }))
export default function GlobalToast() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState("info");
  const timerRef = useRef(null);

  useEffect(() => {
    function onToast(e) {
      try {
        const detail = (e && e.detail) || {};
        const msg = String(detail.message || "");
        if (!msg) return;
        setMessage(msg);
        setVariant(detail.variant || "info");
        setOpen(true);
        const dur = Number(detail.duration || 2000);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setOpen(false), Math.max(800, dur));
      } catch (err) {}
    }
    window.addEventListener("dr_toast", onToast);
    return () => {
      window.removeEventListener("dr_toast", onToast);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="dr-global-toast-container" aria-live="polite" aria-atomic="true">
      <div className={`dr-global-toast ${open ? "open" : ""}`} role="status">
        <div className="dr-global-toast-icon" aria-hidden>
          <LuInfo size={18} />
        </div>
        <div className="dr-global-toast-content">
          <div className="dr-global-toast-title">{variant === 'info' ? 'Info' : ''}</div>
          <div className="dr-global-toast-text">{message}</div>
        </div>
        <button
          className="dr-global-toast-close"
          aria-label="Dismiss notification"
          onClick={() => setOpen(false)}
        >
          <MdClose size={16} />
        </button>
      </div>
    </div>
  );
}
