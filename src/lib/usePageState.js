import { useCallback, useEffect, useMemo, useState } from 'react';

// Encapsulates first-launch behavior, restore-last-page, and hash/localStorage sync
export function usePageState() {
  const deriveInitialActive = useCallback(() => {
    try {
      // First launch: always start at home
      const first = typeof window !== 'undefined' ? localStorage.getItem('dr_first_launch_done') : null;
      if (!first) {
        try { localStorage.setItem('dr_first_launch_done', '1'); } catch {}
        return 'home';
      }
      // Subsequent loads: prefer saved, then hash, else home
      const saved = typeof window !== 'undefined' ? localStorage.getItem('dr_active_page') : null;
      if (saved) return saved;
      const hash = (typeof window !== 'undefined' && window.location && window.location.hash)
        ? window.location.hash.replace(/^#/, '')
        : '';
      if (hash) return hash;
    } catch {}
    return 'home';
  }, []);

  const [active, setActive] = useState(deriveInitialActive);

  // persist to localStorage and sync hash
  useEffect(() => {
    try { localStorage.setItem('dr_active_page', active); } catch {}
    try {
      const target = `#${active}`;
      if (typeof window !== 'undefined' && window.location && window.location.hash !== target) {
        window.history.replaceState(null, '', target);
      }
    } catch {}
  }, [active]);

  // hashchange → update state
  useEffect(() => {
    function onHashChange() {
      try {
        const hash = window.location.hash.replace(/^#/, '') || 'home';
        setActive(hash);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
      return () => window.removeEventListener('hashchange', onHashChange);
    }
  }, []);

  return useMemo(() => ({ active, setActive }), [active]);
}
