import { useEffect, useState } from 'react';

const DEFAULT_BREAKPOINT = 768; // px

// Usage: const isMobile = useIsMobile(); or useIsMobile(640) for a custom breakpoint
export function useIsMobile(breakpoint = DEFAULT_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return window.innerWidth < breakpoint; } catch { return false; }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = `(max-width: ${breakpoint - 1}px)`;
    const mql = window.matchMedia(query);

    // initialize from current state
    setIsMobile(mql.matches || window.innerWidth < breakpoint);

    const onChange = (e) => {
      try {
        // Prefer the event's matches flag; fallback to measuring innerWidth
        setIsMobile((e && typeof e.matches === 'boolean') ? e.matches : (window.innerWidth < breakpoint));
      } catch {
        setIsMobile(window.innerWidth < breakpoint);
      }
    };

    // Add listener (support older Safari)
    try {
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
      else if (typeof mql.addListener === 'function') mql.addListener(onChange);
    } catch {}

    // Fallback: also listen to resize in case matchMedia change doesn’t fire in some environments
    try { window.addEventListener('resize', onChange); } catch {}

    return () => {
      try {
        if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange);
        else if (typeof mql.removeListener === 'function') mql.removeListener(onChange);
      } catch {}
      try { window.removeEventListener('resize', onChange); } catch {}
    };
  }, [breakpoint]);

  return isMobile;
}
